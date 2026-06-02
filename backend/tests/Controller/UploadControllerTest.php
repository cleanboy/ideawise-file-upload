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

        $session = $this->initiateUpload($client, 'clip.txt', 'text/plain', 9, 3);

        self::assertSame(201, $client->getResponse()->getStatusCode());
        self::assertSame(3, $session['totalChunks']);
        self::assertSame('initiated', $session['status']);

        $uploadId = $session['uploadId'];

        $this->uploadChunk($client, $uploadId, 0, 'abc');
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

        $completedFiles = glob(dirname(__DIR__, 2).'/var/uploads/completed/'.$uploadId.'-*');

        self::assertCount(1, $completedFiles);
        self::assertSame('abcdefghi', file_get_contents($completedFiles[0]));
        self::assertSame([], $this->storage()->getStoredChunkIndexes($uploadId));
    }

    public function testFinalizeReconcilesStoredChunksWhenDatabaseProgressIsStale(): void
    {
        $client = $this->client;

        $session = $this->initiateUpload($client, 'race.txt', 'text/plain', 6, 3);
        $uploadId = $session['uploadId'];

        $this->uploadChunk($client, $uploadId, 0, 'abc');
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

        $session = $this->initiateUpload($client, 'partial.txt', 'text/plain', 6, 3);
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

        $session = $this->initiateUpload($client, 'status.txt', 'text/plain', 6, 3);
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

        $session = $this->initiateUpload($client, 'cancel.txt', 'text/plain', 6, 3);
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

        $session = $this->initiateUpload($client, 'cleanup.txt', 'text/plain', 6, 3);
        $uploadId = $session['uploadId'];

        $this->uploadChunk($client, $uploadId, 0, 'abc');

        $client->request('DELETE', '/api/upload/'.$uploadId);

        self::assertSame(204, $client->getResponse()->getStatusCode());
        self::assertSame('', $client->getResponse()->getContent());
        self::assertSame([], $this->storage()->getStoredChunkIndexes($uploadId));
        self::assertNull($this->repository()->find($uploadId));
    }

    public function testDeleteRejectsCompletedUpload(): void
    {
        $client = $this->client;

        $session = $this->initiateUpload($client, 'completed.txt', 'text/plain', 3, 3);
        $uploadId = $session['uploadId'];

        $this->uploadChunk($client, $uploadId, 0, 'abc');

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
}
