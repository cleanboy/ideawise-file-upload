<?php

namespace App\Service;

use Predis\ClientInterface;

readonly class ChunkCacheService
{
    private const TTL = 86400; // 24 hours

    public function __construct(private ClientInterface $redis) {}

    public function addChunk(string $uploadId, int $chunkIndex): void
    {
        try {
            $key = $this->key($uploadId);
            $this->redis->sadd($key, (string) $chunkIndex);
            $this->redis->expire($key, self::TTL);
        } catch (\Throwable) {
            // Best-effort; the chunk binary is already on the filesystem.
        }
    }

    /**
     * Returns sorted chunk indexes from Redis, or null when Redis is unavailable.
     *
     * @return int[]|null
     */
    public function getUploadedChunks(string $uploadId): ?array
    {
        try {
            $members = (array) $this->redis->smembers($this->key($uploadId));
            $chunks = array_map('intval', $members);
            sort($chunks, SORT_NUMERIC);

            return $chunks;
        } catch (\Throwable) {
            return null;
        }
    }

    public function deleteSession(string $uploadId): void
    {
        try {
            $this->redis->del($this->key($uploadId));
        } catch (\Throwable) {
            // Best-effort; TTL will clean it up anyway.
        }
    }

    private function key(string $uploadId): string
    {
        return 'upload:' . $uploadId . ':chunks';
    }
}
