<?php

namespace App\Tests\Service;

use App\Entity\UploadSession;
use App\Service\UploadStorage;
use PHPUnit\Framework\TestCase;
use RecursiveDirectoryIterator;
use RecursiveIteratorIterator;
use SplFileInfo;

class UploadStorageTest extends TestCase
{
    private string $storagePath;

    protected function setUp(): void
    {
        $this->storagePath = sys_get_temp_dir().'/upload-storage-test-'.bin2hex(random_bytes(4));
    }

    protected function tearDown(): void
    {
        if (!is_dir($this->storagePath)) {
            return;
        }

        $files = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($this->storagePath, RecursiveDirectoryIterator::SKIP_DOTS),
            RecursiveIteratorIterator::CHILD_FIRST,
        );

        /** @var SplFileInfo $file */
        foreach ($files as $file) {
            $file->isDir() ? rmdir($file->getRealPath()) : unlink($file->getRealPath());
        }

        rmdir($this->storagePath);
    }

    public function testAssemblesChunksInOrder(): void
    {
        $storage = new UploadStorage($this->storagePath);
        $session = new UploadSession(
            'd132cb0f-7fc6-4730-b277-ff614982d040',
            'demo video.mp4',
            'video/mp4',
            9,
            3,
            3,
        );

        $storage->writeChunk($session->getId(), 2, 'ghi');
        $storage->writeChunk($session->getId(), 0, 'abc');
        $storage->writeChunk($session->getId(), 1, 'def');

        $finalPath = $storage->assemble($session);

        self::assertSame('abcdefghi', file_get_contents($finalPath));
        self::assertStringEndsWith('demo-video.mp4', $finalPath);
    }

    public function testComputesChecksumOfAssembledFile(): void
    {
        $storage = new UploadStorage($this->storagePath);
        $session = new UploadSession(
            'a1b2c3d4-0000-0000-0000-000000000001',
            'image.jpg',
            'image/jpeg',
            6,
            3,
            2,
        );

        $storage->writeChunk($session->getId(), 0, 'abc');
        $storage->writeChunk($session->getId(), 1, 'def');

        $finalPath = $storage->assemble($session);
        $checksum = $storage->computeChecksum($finalPath);

        self::assertSame(md5('abcdef'), $checksum);
        self::assertMatchesRegularExpression('/^[0-9a-f]{32}$/', $checksum);
    }

    public function testListsStoredChunkIndexes(): void
    {
        $storage = new UploadStorage($this->storagePath);
        $uploadId = '90a84699-fd70-4f1b-8354-90eaa6e89c22';

        $storage->writeChunk($uploadId, 9, 'j');
        $storage->writeChunk($uploadId, 2, 'c');
        $storage->writeChunk($uploadId, 0, 'a');

        self::assertSame([0, 2, 9], $storage->getStoredChunkIndexes($uploadId));
    }
}
