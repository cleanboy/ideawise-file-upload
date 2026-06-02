<?php

namespace App\Controller;

use App\Entity\UploadSession;
use App\Repository\UploadSessionRepository;
use App\Service\UploadStorage;
use Doctrine\ORM\EntityManagerInterface;
use JsonException;
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
            $this->entityManager->flush();
        } catch (Throwable) {
            $session->fail();
            $this->entityManager->flush();

            return $this->error('storage_error', 'Chunk could not be stored.', 500);
        }

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

        if (!$session->hasAllChunks()) {
            return $this->error('incomplete_upload', 'All chunks must be uploaded before finalizing.', 409);
        }

        try {
            $finalPath = $this->storage->assemble($session);
            $session->complete($finalPath);
            $this->storage->removeUpload($session->getId());
            $this->entityManager->flush();
        } catch (Throwable) {
            $session->fail();
            $this->entityManager->flush();

            return $this->error('storage_error', 'Upload could not be finalized.', 500);
        }

        return $this->json($this->serializeSession($session));
    }

    #[Route('/status/{id}', methods: ['GET'])]
    public function status(string $id): JsonResponse
    {
        $session = $this->findSession($id);

        if (!$session instanceof UploadSession) {
            return $this->error('not_found', 'Upload session was not found.', 404);
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
        $this->storage->removeUpload($session->getId());
        $this->entityManager->flush();

        return $this->json($this->serializeSession($session));
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

    private function createUploadId(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }
}
