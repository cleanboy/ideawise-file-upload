<?php

namespace App\Tests\Service;

use App\Service\ChunkCacheService;
use PHPUnit\Framework\TestCase;
use Predis\ClientInterface;

class ChunkCacheServiceTest extends TestCase
{
    // ─── helpers ─────────────────────────────────────────────────────────────

    /**
     * Returns a Predis client mock that routes __call() by command name.
     * The $store array is used as an in-memory SET per key.
     *
     * @param array<string, list<string>> $store Initial Redis SET state.
     */
    private function makeRedis(array &$store = []): ClientInterface
    {
        $mock = $this->createMock(ClientInterface::class);

        $mock->method('__call')
            ->willReturnCallback(function (string $command, array $args) use (&$store): mixed {
                return match ($command) {
                    'sadd' => ($store[$args[0]][] = $args[1]) && 1,
                    'smembers' => $store[$args[0]] ?? [],
                    'del' => (function () use (&$store, $args) { unset($store[$args[0]]); return 1; })(),
                    'expire' => 1,
                    default => null,
                };
            });

        return $mock;
    }

    private function makeThrowingRedis(): ClientInterface
    {
        $mock = $this->createMock(ClientInterface::class);
        $mock->method('__call')->willThrowException(new \RuntimeException('Redis connection refused'));

        return $mock;
    }

    // ─── addChunk ─────────────────────────────────────────────────────────────

    public function testAddChunkCallsSaddAndExpire(): void
    {
        $redis = $this->createMock(ClientInterface::class);
        $redis->expects($this->exactly(2))
            ->method('__call')
            ->willReturnCallback(function (string $command): mixed {
                return match ($command) {
                    'sadd', 'expire' => 1,
                    default => null,
                };
            });

        (new ChunkCacheService($redis))->addChunk('upload-1', 0);
    }

    public function testAddChunkUsesCorrectKeyFormat(): void
    {
        $redis = $this->createMock(ClientInterface::class);
        $seenKey = null;

        $redis->method('__call')
            ->willReturnCallback(function (string $cmd, array $args) use (&$seenKey): int {
                if ($cmd === 'sadd') {
                    $seenKey = $args[0];
                }

                return 1;
            });

        (new ChunkCacheService($redis))->addChunk('abc-123', 5);

        $this->assertSame('upload:abc-123:chunks', $seenKey);
    }

    public function testAddChunkSilentlyIgnoresRedisErrors(): void
    {
        $this->expectNotToPerformAssertions();
        (new ChunkCacheService($this->makeThrowingRedis()))->addChunk('upload-1', 0);
    }

    // ─── getUploadedChunks ────────────────────────────────────────────────────

    public function testGetUploadedChunksReturnsSortedIntegers(): void
    {
        $store = ['upload:upload-1:chunks' => ['2', '0', '1']];
        $service = new ChunkCacheService($this->makeRedis($store));

        $this->assertSame([0, 1, 2], $service->getUploadedChunks('upload-1'));
    }

    public function testGetUploadedChunksReturnsEmptyArrayWhenKeyDoesNotExist(): void
    {
        $store = [];
        $service = new ChunkCacheService($this->makeRedis($store));

        $this->assertSame([], $service->getUploadedChunks('missing-id'));
    }

    public function testGetUploadedChunksReturnsNullWhenRedisThrows(): void
    {
        $service = new ChunkCacheService($this->makeThrowingRedis());

        $this->assertNull($service->getUploadedChunks('upload-1'));
    }

    // ─── deleteSession ────────────────────────────────────────────────────────

    public function testDeleteSessionRemovesTheKey(): void
    {
        $store = ['upload:upload-1:chunks' => ['0', '1']];
        $service = new ChunkCacheService($this->makeRedis($store));

        $service->deleteSession('upload-1');

        $this->assertArrayNotHasKey('upload:upload-1:chunks', $store);
    }

    public function testDeleteSessionSilentlyIgnoresRedisErrors(): void
    {
        $this->expectNotToPerformAssertions();
        (new ChunkCacheService($this->makeThrowingRedis()))->deleteSession('upload-1');
    }

    // ─── key isolation ────────────────────────────────────────────────────────

    public function testDifferentUploadIdsUseDistinctKeys(): void
    {
        $store = [
            'upload:upload-a:chunks' => ['0'],
            'upload:upload-b:chunks' => ['0', '1'],
        ];
        $service = new ChunkCacheService($this->makeRedis($store));

        $this->assertSame([0], $service->getUploadedChunks('upload-a'));
        $this->assertSame([0, 1], $service->getUploadedChunks('upload-b'));
    }
}
