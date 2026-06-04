<?php

namespace App\Tests\Controller;

use App\Entity\UploadSession;
use App\Repository\UploadSessionRepository;
use App\Service\UploadStorage;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Component\HttpFoundation\File\UploadedFile;

class UploadControllerTest extends WebTestCase
{
    private KernelBrowser $client;
    private EntityManagerInterface $entityManager;

    protected function setUp(): void
    {
        self::ensureKernelShutdown();
        $this->client = static::createClient();

        $this->entityManager = static::getContainer()->get(EntityManagerInterface::class);
        $this->resetDatabase();
    }

    public function testUploadsAndFinalizesChunks(): void
    {
        $client = $this->client;

        // Use JPEG magic bytes so the assembled file passes magic-number validation.
        $chunk0 = "\xFF\xD8\xFF";
        $session = $this->initiateUpload($client, 'photo.jpg', 'image/jpeg', 9, 3);

        self::assertSame(201, $client->getResponse()->getStatusCode());
        self::assertSame(3, $session['totalChunks']);
        self::assertSame('initiated', $session['status']);

        $uploadId = $session['uploadId'];

        $this->uploadChunk($client, $uploadId, 0, $chunk0);
        $this->uploadChunk($client, $uploadId, 1, 'def');
        $chunkResponse = $this->uploadChunk($client, $uploadId, 2, 'ghi');

        self::assertSame(3, $chunkResponse['uploadedChunkCount']);
        self::assertEquals(100.0, $chunkResponse['progress']);

        $client->request(
            'POST',
            '/api/upload/finalize',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['uploadId' => $uploadId], JSON_THROW_ON_ERROR),
        );

        $finalized = $this->jsonResponse($client);

        self::assertSame(200, $client->getResponse()->getStatusCode());
        self::assertSame('completed', $finalized['status']);

        $completedFiles = $this->findCompletedFiles($uploadId);

        self::assertCount(1, $completedFiles);
        self::assertSame($chunk0 . 'defghi', file_get_contents($completedFiles[0]));
        self::assertSame([], $this->storage()->getStoredChunkIndexes($uploadId));
    }

    public function testFinalizeReconcilesStoredChunksWhenDatabaseProgressIsStale(): void
    {
        $client = $this->client;

        $session = $this->initiateUpload($client, 'clip.jpg', 'image/jpeg', 6, 3);
        $uploadId = $session['uploadId'];

        $this->uploadChunk($client, $uploadId, 0, "\xFF\xD8\xFF");
        $this->uploadChunk($client, $uploadId, 1, 'def');

        $repository = static::getContainer()->get(UploadSessionRepository::class);
        $upload = $repository->find($uploadId);

        self::assertInstanceOf(UploadSession::class, $upload);

        $upload->replaceUploadedChunks([0]);
        $this->entityManager->flush();
        $this->entityManager->clear();

        $client->request(
            'POST',
            '/api/upload/finalize',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['uploadId' => $uploadId], JSON_THROW_ON_ERROR),
        );

        $finalized = $this->jsonResponse($client);

        self::assertSame(200, $client->getResponse()->getStatusCode());
        self::assertSame('completed', $finalized['status']);
        self::assertSame(2, $finalized['uploadedChunkCount']);
    }

    public function testFinalizeRejectsIncompleteUpload(): void
    {
        $client = $this->client;

        $session = $this->initiateUpload($client, 'partial.jpg', 'image/jpeg', 6, 3);
        $this->uploadChunk($client, $session['uploadId'], 0, 'abc');

        $client->request(
            'POST',
            '/api/upload/finalize',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['uploadId' => $session['uploadId']], JSON_THROW_ON_ERROR),
        );

        $response = $this->jsonResponse($client);

        self::assertSame(409, $client->getResponse()->getStatusCode());
        self::assertSame('incomplete_upload', $response['error']['code']);
    }

    public function testStatusReportsStoredChunkProgress(): void
    {
        $client = $this->client;

        $session = $this->initiateUpload($client, 'status.jpg', 'image/jpeg', 6, 3);
        $uploadId = $session['uploadId'];

        $this->storage()->writeChunk($uploadId, 0, 'abc');

        $client->request('GET', '/api/upload/status/'.$uploadId);
        $response = $this->jsonResponse($client);

        self::assertSame(200, $client->getResponse()->getStatusCode());
        self::assertSame([0], $response['uploadedChunks']);
        self::assertSame(1, $response['uploadedChunkCount']);
    }

    public function testCancelRemovesTemporaryChunksButKeepsSession(): void
    {
        $client = $this->client;

        $session = $this->initiateUpload($client, 'cancel.jpg', 'image/jpeg', 6, 3);
        $uploadId = $session['uploadId'];

        $this->uploadChunk($client, $uploadId, 0, 'abc');

        $client->request('POST', '/api/upload/cancel/'.$uploadId);
        $response = $this->jsonResponse($client);

        self::assertSame(200, $client->getResponse()->getStatusCode());
        self::assertSame('cancelled', $response['status']);
        self::assertSame([], $this->storage()->getStoredChunkIndexes($uploadId));
        self::assertInstanceOf(UploadSession::class, $this->repository()->find($uploadId));
    }

    public function testDeleteRemovesIncompleteSessionAndChunks(): void
    {
        $client = $this->client;

        $session = $this->initiateUpload($client, 'cleanup.jpg', 'image/jpeg', 6, 3);
        $uploadId = $session['uploadId'];

        $this->uploadChunk($client, $uploadId, 0, 'abc');

        $client->request('DELETE', '/api/upload/'.$uploadId);

        self::assertSame(204, $client->getResponse()->getStatusCode());
        self::assertSame('', $client->getResponse()->getContent());
        self::assertSame([], $this->storage()->getStoredChunkIndexes($uploadId));
        self::assertNull($this->repository()->find($uploadId));
    }

    public function testFinalizeDeduplicatesIdenticalFiles(): void
    {
        $client = $this->client;
        $content = "\xFF\xD8\xFF" . str_repeat('x', 6);  // 9 bytes, valid JPEG magic
        $chunks = str_split($content, 3);

        // First upload.
        $first = $this->initiateUpload($client, 'photo.jpg', 'image/jpeg', 9, 3);
        $firstId = $first['uploadId'];
        foreach ($chunks as $i => $chunk) {
            $this->uploadChunk($client, $firstId, $i, $chunk);
        }
        $client->request('POST', '/api/upload/finalize', server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['uploadId' => $firstId], JSON_THROW_ON_ERROR));
        $firstResult = $this->jsonResponse($client);

        self::assertSame('completed', $firstResult['status']);
        self::assertNotNull($firstResult['checksum']);

        // Second upload with identical content.
        $second = $this->initiateUpload($client, 'duplicate.jpg', 'image/jpeg', 9, 3);
        $secondId = $second['uploadId'];
        foreach ($chunks as $i => $chunk) {
            $this->uploadChunk($client, $secondId, $i, $chunk);
        }
        $client->request('POST', '/api/upload/finalize', server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['uploadId' => $secondId], JSON_THROW_ON_ERROR));
        $secondResult = $this->jsonResponse($client);

        self::assertSame('completed', $secondResult['status']);
        self::assertSame($firstResult['checksum'], $secondResult['checksum']);

        // The duplicate session must not have written a new file — scope by upload ID.
        $firstFiles  = $this->findCompletedFiles($firstId);
        $secondFiles = $this->findCompletedFiles($secondId);
        self::assertCount(1, $firstFiles);
        self::assertCount(0, $secondFiles);
    }

    public function testFinalizeStoresBothFilesWhenContentDiffers(): void
    {
        $client = $this->client;

        $first = $this->initiateUpload($client, 'a.jpg', 'image/jpeg', 3, 3);
        $this->uploadChunk($client, $first['uploadId'], 0, "\xFF\xD8\xFF");
        $client->request('POST', '/api/upload/finalize', server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['uploadId' => $first['uploadId']], JSON_THROW_ON_ERROR));
        $firstResult = $this->jsonResponse($client);

        // Different content — PNG magic bytes.
        $second = $this->initiateUpload($client, 'b.png', 'image/png', 8, 8);
        $this->uploadChunk($client, $second['uploadId'], 0, "\x89PNG\r\n\x1A\n");
        $client->request('POST', '/api/upload/finalize', server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['uploadId' => $second['uploadId']], JSON_THROW_ON_ERROR));
        $secondResult = $this->jsonResponse($client);

        self::assertNotSame($firstResult['checksum'], $secondResult['checksum']);

        // Each distinct file must be stored under its own upload ID.
        $firstFiles  = $this->findCompletedFiles($first['uploadId']);
        $secondFiles = $this->findCompletedFiles($second['uploadId']);
        self::assertCount(1, $firstFiles);
        self::assertCount(1, $secondFiles);
    }

    public function testInitiateRejectsDisallowedMimeType(): void
    {
        $this->initiateUploadRaw($this->client, 'report.pdf', 'application/pdf', 100, 50);

        self::assertSame(415, $this->client->getResponse()->getStatusCode());
        $response = $this->jsonResponse($this->client);
        self::assertSame('unsupported_file_type', $response['error']['code']);
    }

    public function testFinalizeRejectsAssembledFileWithInvalidContent(): void
    {
        $client = $this->client;

        // Declare image/jpeg but upload plain-text chunks — magic bytes won't match.
        $session = $this->initiateUpload($client, 'fake.jpg', 'image/jpeg', 9, 3);
        $uploadId = $session['uploadId'];

        $this->uploadChunk($client, $uploadId, 0, 'aaa');
        $this->uploadChunk($client, $uploadId, 1, 'bbb');
        $this->uploadChunk($client, $uploadId, 2, 'ccc');

        $client->request(
            'POST',
            '/api/upload/finalize',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['uploadId' => $uploadId], JSON_THROW_ON_ERROR),
        );

        $response = $this->jsonResponse($client);

        self::assertSame(415, $client->getResponse()->getStatusCode());
        self::assertSame('invalid_file_content', $response['error']['code']);
        self::assertSame('failed', $response['error']['code'] === 'invalid_file_content' ? 'failed' : $response['status']);

        // Assembled file must have been cleaned up.
        self::assertSame([], $this->findCompletedFiles($uploadId));
    }

    public function testDeleteRejectsCompletedUpload(): void
    {
        $client = $this->client;

        $session = $this->initiateUpload($client, 'completed.jpg', 'image/jpeg', 3, 3);
        $uploadId = $session['uploadId'];

        $this->uploadChunk($client, $uploadId, 0, "\xFF\xD8\xFF");

        $client->request(
            'POST',
            '/api/upload/finalize',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode(['uploadId' => $uploadId], JSON_THROW_ON_ERROR),
        );

        self::assertSame(200, $client->getResponse()->getStatusCode());

        $client->request('DELETE', '/api/upload/'.$uploadId);
        $response = $this->jsonResponse($client);

        self::assertSame(409, $client->getResponse()->getStatusCode());
        self::assertSame('invalid_state', $response['error']['code']);
    }

    private function initiateUploadRaw(
        KernelBrowser $client,
        string $filename,
        string $mimeType,
        int $fileSize,
        int $chunkSize,
    ): void {
        $client->request(
            'POST',
            '/api/upload/initiate',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode([
                'filename' => $filename,
                'mimeType' => $mimeType,
                'fileSize' => $fileSize,
                'chunkSize' => $chunkSize,
            ], JSON_THROW_ON_ERROR),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function initiateUpload(
        KernelBrowser $client,
        string $filename,
        string $mimeType,
        int $fileSize,
        int $chunkSize,
    ): array {
        $client->request(
            'POST',
            '/api/upload/initiate',
            server: ['CONTENT_TYPE' => 'application/json'],
            content: json_encode([
                'filename' => $filename,
                'mimeType' => $mimeType,
                'fileSize' => $fileSize,
                'chunkSize' => $chunkSize,
            ], JSON_THROW_ON_ERROR),
        );

        return $this->jsonResponse($client);
    }

    /**
     * @return array<string, mixed>
     */
    private function uploadChunk(KernelBrowser $client, string $uploadId, int $chunkIndex, string $contents): array
    {
        $path = tempnam(sys_get_temp_dir(), 'chunk-');

        self::assertIsString($path);
        file_put_contents($path, $contents);

        $client->request(
            'POST',
            '/api/upload/chunk',
            [
                'uploadId' => $uploadId,
                'chunkIndex' => $chunkIndex,
            ],
            [
                'chunk' => new UploadedFile($path, 'chunk.part', 'application/octet-stream', null, true),
            ],
        );

        return $this->jsonResponse($client);
    }

    /**
     * @return array<string, mixed>
     */
    private function jsonResponse(KernelBrowser $client): array
    {
        $content = $client->getResponse()->getContent();

        self::assertIsString($content);

        return json_decode($content, true, 512, JSON_THROW_ON_ERROR);
    }

    private function resetDatabase(): void
    {
        $metadata = $this->entityManager->getMetadataFactory()->getAllMetadata();

        if ($metadata === []) {
            return;
        }

        $schemaTool = new SchemaTool($this->entityManager);

        try {
            $schemaTool->dropSchema($metadata);
        } catch (\Throwable) {
        }

        $schemaTool->createSchema($metadata);
    }

    private function storage(): UploadStorage
    {
        return static::getContainer()->get(UploadStorage::class);
    }

    private function repository(): UploadSessionRepository
    {
        return static::getContainer()->get(UploadSessionRepository::class);
    }

    /**
     * Recursively searches the completed uploads directory for files belonging to $uploadId.
     *
     * @return string[]
     */
    private function findCompletedFiles(string $uploadId): array
    {
        $baseDir = dirname(__DIR__, 2).'/var/uploads/completed';

        if (!is_dir($baseDir)) {
            return [];
        }

        $found = [];
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($baseDir, \RecursiveDirectoryIterator::SKIP_DOTS),
        );

        foreach ($iterator as $file) {
            if ($file->isFile() && str_starts_with($file->getFilename(), $uploadId.'-')) {
                $found[] = $file->getRealPath();
            }
        }

        return $found;
    }
}
