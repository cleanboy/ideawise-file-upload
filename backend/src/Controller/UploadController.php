<?php

namespace App\Controller;

use App\Entity\UploadSession;
use App\Repository\UploadSessionRepository;
use App\Service\ChunkCacheService;
use App\Service\FileTypeValidator;
use App\Service\UploadStorage;
use Doctrine\ORM\EntityManagerInterface;
use JsonException;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\File\UploadedFile;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Throwable;

#[Route('/api/upload')]
class UploadController extends AbstractController
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly UploadSessionRepository $uploadSessions,
        private readonly UploadStorage $storage,
        private readonly FileTypeValidator $fileTypeValidator,
        private readonly ChunkCacheService $chunkCache,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/initiate', methods: ['POST'])]
    public function initiate(Request $request): JsonResponse
    {
        try {
            $payload = $this->decodeJson($request);
        } catch (JsonException) {
            return $this->error('invalid_request', 'Request body must be valid JSON.', 400);
        }

        $filename = trim((string) ($payload['filename'] ?? ''));
        $mimeType = trim((string) ($payload['mimeType'] ?? 'application/octet-stream'));
        $fileSize = (int) ($payload['fileSize'] ?? 0);
        $chunkSize = (int) ($payload['chunkSize'] ?? 0);

        if ($filename === '' || $fileSize <= 0 || $chunkSize <= 0) {
            return $this->error('invalid_request', 'filename, fileSize, and chunkSize are required.', 400);
        }

        if (!$this->fileTypeValidator->isAllowedMimeType($mimeType)) {
            $this->logger->warning('Upload rejected: unsupported MIME type', ['filename' => $filename, 'mimeType' => $mimeType]);

            return $this->error('unsupported_file_type', 'Only image and video files are accepted.', 415);
        }

        $session = new UploadSession(
            $this->createUploadId(),
            $filename,
            $mimeType !== '' ? $mimeType : 'application/octet-stream',
            $fileSize,
            $chunkSize,
            (int) ceil($fileSize / $chunkSize),
        );

        $this->entityManager->persist($session);
        $this->entityManager->flush();

        $this->logger->info('Upload session initiated', [
            'uploadId' => $session->getId(),
            'filename' => $filename,
            'mimeType' => $mimeType,
            'fileSize' => $fileSize,
            'totalChunks' => $session->getTotalChunks(),
        ]);

        return $this->json($this->serializeSession($session), 201);
    }

    #[Route('/chunk', methods: ['POST'])]
    public function chunk(Request $request): JsonResponse
    {
        $uploadId = trim((string) $request->request->get('uploadId', ''));
        $chunkIndex = $request->request->getInt('chunkIndex', -1);
        $chunk = $request->files->get('chunk');

        if ($uploadId === '' || $chunkIndex < 0 || !$chunk instanceof UploadedFile) {
            return $this->error('invalid_request', 'uploadId, chunkIndex, and chunk file are required.', 400);
        }

        $session = $this->uploadSessions->find($uploadId);

        if (!$session instanceof UploadSession) {
            return $this->error('not_found', 'Upload session was not found.', 404);
        }

        if (!$session->canAcceptChunks()) {
            return $this->error('invalid_state', 'Upload session cannot accept chunks.', 409);
        }

        if ($chunkIndex >= $session->getTotalChunks()) {
            return $this->error('invalid_request', 'chunkIndex is outside the expected range.', 400);
        }

        try {
            $this->storage->storeUploadedChunk($session, $chunkIndex, $chunk);
            $session->markChunkUploaded($chunkIndex);
            $this->chunkCache->addChunk($session->getId(), $chunkIndex);
            $this->entityManager->flush();
        } catch (Throwable $e) {
            $this->logger->error('Chunk storage failed', ['uploadId' => $uploadId, 'chunkIndex' => $chunkIndex, 'error' => $e->getMessage()]);

            return $this->error('storage_error', sprintf('Chunk %d could not be stored.', $chunkIndex), 500);
        }

        $this->logger->debug('Chunk stored', ['uploadId' => $uploadId, 'chunkIndex' => $chunkIndex]);

        return $this->json($this->serializeSession($session));
    }

    #[Route('/finalize', methods: ['POST'])]
    public function finalize(Request $request): JsonResponse
    {
        try {
            $payload = $this->decodeJson($request);
        } catch (JsonException) {
            return $this->error('invalid_request', 'Request body must be valid JSON.', 400);
        }

        $session = $this->findSession((string) ($payload['uploadId'] ?? ''));

        if (!$session instanceof UploadSession) {
            return $this->error('not_found', 'Upload session was not found.', 404);
        }

        if ($session->getStatus() === UploadSession::STATUS_COMPLETED) {
            return $this->json($this->serializeSession($session));
        }

        $this->syncChunks($session);
        $this->entityManager->flush();

        if (!$session->hasAllChunks()) {
            return $this->error('incomplete_upload', 'All chunks must be uploaded before finalizing.', 409);
        }

        try {
            $finalPath = $this->storage->assemble($session);
        } catch (Throwable $e) {
            $this->logger->error('Upload assembly failed', ['uploadId' => $session->getId(), 'error' => $e->getMessage()]);
            $session->fail();
            $this->entityManager->flush();

            return $this->error('storage_error', 'Upload could not be finalized.', 500);
        }

        try {
            $this->fileTypeValidator->assertValidMagicBytes($finalPath);
        } catch (Throwable) {
            $this->logger->warning('Magic bytes validation failed', ['uploadId' => $session->getId(), 'filename' => $session->getOriginalFilename()]);
            @unlink($finalPath);
            $session->fail();
            $this->entityManager->flush();

            return $this->error('invalid_file_content', 'File content does not match an allowed media type.', 415);
        }

        $checksum = $this->storage->computeChecksum($finalPath);
        $duplicate = $this->uploadSessions->findCompletedByChecksum($checksum);

        if ($duplicate instanceof UploadSession) {
            $this->logger->info('Duplicate file detected, reusing existing path', ['uploadId' => $session->getId(), 'checksum' => $checksum]);
            @unlink($finalPath);
            $finalPath = $duplicate->getFinalPath() ?? $finalPath;
        }

        $session->complete($finalPath, $checksum);
        $this->chunkCache->deleteSession($session->getId());
        $this->storage->removeUpload($session->getId());
        $this->entityManager->flush();

        $this->logger->info('Upload finalized', ['uploadId' => $session->getId(), 'checksum' => $checksum, 'deduplicated' => $duplicate instanceof UploadSession]);

        return $this->json($this->serializeSession($session));
    }

    #[Route('/status/{id}', methods: ['GET'])]
    public function status(string $id): JsonResponse
    {
        $session = $this->findSession($id);

        if (!$session instanceof UploadSession) {
            return $this->error('not_found', 'Upload session was not found.', 404);
        }

        if ($session->canAcceptChunks()) {
            $this->syncChunks($session);
            $this->entityManager->flush();
        }

        return $this->json($this->serializeSession($session));
    }

    #[Route('/cancel/{id}', methods: ['POST'])]
    public function cancel(string $id): JsonResponse
    {
        $session = $this->findSession($id);

        if (!$session instanceof UploadSession) {
            return $this->error('not_found', 'Upload session was not found.', 404);
        }

        $session->cancel();
        $this->chunkCache->deleteSession($session->getId());
        $this->storage->removeUpload($session->getId());
        $this->entityManager->flush();

        $this->logger->info('Upload session cancelled', ['uploadId' => $session->getId()]);

        return $this->json($this->serializeSession($session));
    }

    #[Route('/{id}', methods: ['DELETE'])]
    public function delete(string $id): JsonResponse
    {
        $session = $this->findSession($id);

        if (!$session instanceof UploadSession) {
            return $this->error('not_found', 'Upload session was not found.', 404);
        }

        if ($session->getStatus() === UploadSession::STATUS_COMPLETED) {
            return $this->error('invalid_state', 'Completed uploads cannot be removed with this cleanup action.', 409);
        }

        $this->chunkCache->deleteSession($session->getId());
        $this->storage->removeUpload($session->getId());
        $this->entityManager->remove($session);
        $this->entityManager->flush();

        $this->logger->info('Upload session deleted', ['uploadId' => $session->getId()]);

        return $this->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     *
     * @throws JsonException
     */
    private function decodeJson(Request $request): array
    {
        $payload = json_decode($request->getContent(), true, 512, JSON_THROW_ON_ERROR);

        return is_array($payload) ? $payload : [];
    }

    private function findSession(string $uploadId): ?UploadSession
    {
        $uploadId = trim($uploadId);

        if ($uploadId === '') {
            return null;
        }

        $session = $this->uploadSessions->find($uploadId);

        return $session instanceof UploadSession ? $session : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function serializeSession(UploadSession $session): array
    {
        return [
            'uploadId' => $session->getId(),
            'filename' => $session->getOriginalFilename(),
            'mimeType' => $session->getMimeType(),
            'fileSize' => $session->getFileSize(),
            'chunkSize' => $session->getChunkSize(),
            'totalChunks' => $session->getTotalChunks(),
            'uploadedChunks' => $session->getUploadedChunks(),
            'uploadedChunkCount' => $session->getUploadedChunkCount(),
            'progress' => $session->getProgressPercent(),
            'status' => $session->getStatus(),
            'checksum' => $session->getChecksum(),
            'createdAt' => $session->getCreatedAt()->format(DATE_ATOM),
            'updatedAt' => $session->getUpdatedAt()->format(DATE_ATOM),
            'completedAt' => $session->getCompletedAt()?->format(DATE_ATOM),
        ];
    }

    private function error(string $code, string $message, int $status): JsonResponse
    {
        return $this->json([
            'error' => [
                'code' => $code,
                'message' => $message,
            ],
        ], $status);
    }

    private function syncChunks(UploadSession $session): void
    {
        $chunks = $this->chunkCache->getUploadedChunks($session->getId());

        if ($chunks === null) {
            $chunks = $this->storage->getStoredChunkIndexes($session->getId());
        }

        if ($chunks !== $session->getUploadedChunks()) {
            $session->replaceUploadedChunks($chunks);
        }
    }

    private function createUploadId(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
