<?php

namespace App\Service;

use App\Entity\UploadSession;
use RuntimeException;
use Symfony\Component\HttpFoundation\File\UploadedFile;

readonly class UploadStorage
{
    public function __construct(private string $uploadStoragePath)
    {
    }

    public function storeUploadedChunk(UploadSession $session, int $chunkIndex, UploadedFile $chunk): string
    {
        $targetPath = $this->getChunkPath($session->getId(), $chunkIndex);
        $this->ensureDirectory(dirname($targetPath));

        $chunk->move(dirname($targetPath), basename($targetPath));

        return $targetPath;
    }

    public function writeChunk(string $uploadId, int $chunkIndex, string $contents): string
    {
        $targetPath = $this->getChunkPath($uploadId, $chunkIndex);
        $this->ensureDirectory(dirname($targetPath));

        if (file_put_contents($targetPath, $contents) === false) {
            throw new RuntimeException(sprintf('Unable to write chunk %d for upload %s.', $chunkIndex, $uploadId));
        }

        return $targetPath;
    }

    public function assemble(UploadSession $session): string
    {
        $completedDirectory = $this->uploadStoragePath.'/completed/'.(new \DateTimeImmutable())->format('Y/m/d');
        $this->ensureDirectory($completedDirectory);

        $finalPath = $completedDirectory.'/'.$session->getId().'-'.$this->sanitizeFilename($session->getOriginalFilename());
        $output = fopen($finalPath, 'wb');

        if ($output === false) {
            throw new RuntimeException(sprintf('Unable to create final file for upload %s.', $session->getId()));
        }

        try {
            for ($chunkIndex = 0; $chunkIndex < $session->getTotalChunks(); $chunkIndex++) {
                $chunkPath = $this->getChunkPath($session->getId(), $chunkIndex);

                if (!is_file($chunkPath)) {
                    throw new RuntimeException(sprintf('Missing chunk %d for upload %s.', $chunkIndex, $session->getId()));
                }

                $input = fopen($chunkPath, 'rb');

                if ($input === false) {
                    throw new RuntimeException(sprintf('Unable to read chunk %d for upload %s.', $chunkIndex, $session->getId()));
                }

                stream_copy_to_stream($input, $output);
                fclose($input);
            }
        } finally {
            fclose($output);
        }

        return $finalPath;
    }

    public function computeChecksum(string $filePath): string
    {
        $checksum = md5_file($filePath);

        if ($checksum === false) {
            throw new RuntimeException(sprintf('Unable to compute checksum for %s.', $filePath));
        }

        return $checksum;
    }

    public function removeUpload(string $uploadId): void
    {
        $this->removeDirectory($this->uploadStoragePath.'/chunks/'.$uploadId);
    }

    /**
     * @return int[]
     */
    public function getStoredChunkIndexes(string $uploadId): array
    {
        $directory = $this->uploadStoragePath.'/chunks/'.$uploadId;

        if (!is_dir($directory)) {
            return [];
        }

        $items = scandir($directory);

        if ($items === false) {
            return [];
        }

        $chunkIndexes = [];

        foreach ($items as $item) {
            if (preg_match('/^(\d+)\.part$/', $item, $matches) !== 1) {
                continue;
            }

            $chunkIndexes[] = (int) $matches[1];
        }

        sort($chunkIndexes, SORT_NUMERIC);

        return $chunkIndexes;
    }

    private function getChunkPath(string $uploadId, int $chunkIndex): string
    {
        return $this->uploadStoragePath.'/chunks/'.$uploadId.'/'.$chunkIndex.'.part';
    }

    private function ensureDirectory(string $path): void
    {
        if (is_dir($path)) {
            return;
        }

        if (!mkdir($path, 0775, true) && !is_dir($path)) {
            throw new RuntimeException(sprintf('Unable to create directory %s.', $path));
        }
    }

    private function sanitizeFilename(string $filename): string
    {
        $filename = preg_replace('/[^A-Za-z0-9._-]+/', '-', $filename) ?? 'upload';
        $filename = trim($filename, '.-');

        return $filename !== '' ? $filename : 'upload';
    }

    private function removeDirectory(string $directory): void
    {
        if (!is_dir($directory)) {
            return;
        }

        $items = scandir($directory);

        if ($items === false) {
            return;
        }

        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }

            $path = $directory.'/'.$item;
            is_dir($path) ? $this->removeDirectory($path) : unlink($path);
        }

        rmdir($directory);
    }
}
