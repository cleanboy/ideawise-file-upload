<?php

namespace App\Tests\Service;

use App\Service\FileTypeValidator;
use PHPUnit\Framework\TestCase;
use RuntimeException;

class FileTypeValidatorTest extends TestCase
{
    private FileTypeValidator $validator;
    private string $tmpFile;

    protected function setUp(): void
    {
        $this->validator = new FileTypeValidator();
        $this->tmpFile = tempnam(sys_get_temp_dir(), 'ftype-');
        self::assertIsString($this->tmpFile);
    }

    protected function tearDown(): void
    {
        if (is_file($this->tmpFile)) {
            unlink($this->tmpFile);
        }
    }

    // --- Whitelist ---

    public function testAllowsImageMimeTypes(): void
    {
        self::assertTrue($this->validator->isAllowedMimeType('image/jpeg'));
        self::assertTrue($this->validator->isAllowedMimeType('image/png'));
        self::assertTrue($this->validator->isAllowedMimeType('image/gif'));
        self::assertTrue($this->validator->isAllowedMimeType('image/webp'));
        self::assertTrue($this->validator->isAllowedMimeType('image/bmp'));
        self::assertTrue($this->validator->isAllowedMimeType('image/tiff'));
        self::assertTrue($this->validator->isAllowedMimeType('image/heic'));
        self::assertTrue($this->validator->isAllowedMimeType('image/heif'));
    }

    public function testAllowsVideoMimeTypes(): void
    {
        self::assertTrue($this->validator->isAllowedMimeType('video/mp4'));
        self::assertTrue($this->validator->isAllowedMimeType('video/mpeg'));
        self::assertTrue($this->validator->isAllowedMimeType('video/quicktime'));
        self::assertTrue($this->validator->isAllowedMimeType('video/x-msvideo'));
        self::assertTrue($this->validator->isAllowedMimeType('video/webm'));
        self::assertTrue($this->validator->isAllowedMimeType('video/x-matroska'));
        self::assertTrue($this->validator->isAllowedMimeType('video/ogg'));
        self::assertTrue($this->validator->isAllowedMimeType('video/x-flv'));
        self::assertTrue($this->validator->isAllowedMimeType('video/x-ms-wmv'));
        self::assertTrue($this->validator->isAllowedMimeType('video/3gpp'));
        self::assertTrue($this->validator->isAllowedMimeType('video/3gpp2'));
    }

    public function testRejectsDisallowedMimeTypes(): void
    {
        self::assertFalse($this->validator->isAllowedMimeType('text/plain'));
        self::assertFalse($this->validator->isAllowedMimeType('application/pdf'));
        self::assertFalse($this->validator->isAllowedMimeType('application/octet-stream'));
        self::assertFalse($this->validator->isAllowedMimeType('text/html'));
        self::assertFalse($this->validator->isAllowedMimeType('application/javascript'));
        self::assertFalse($this->validator->isAllowedMimeType('application/zip'));
    }

    public function testMimeTypeCheckIsCaseInsensitive(): void
    {
        self::assertTrue($this->validator->isAllowedMimeType('IMAGE/JPEG'));
        self::assertTrue($this->validator->isAllowedMimeType('Video/MP4'));
        self::assertTrue($this->validator->isAllowedMimeType('Image/PNG'));
    }

    public function testAssertAllowedMimeTypeThrowsForDisallowedType(): void
    {
        $this->expectException(RuntimeException::class);
        $this->validator->assertAllowedMimeType('application/pdf');
    }

    public function testAssertAllowedMimeTypeDoesNotThrowForAllowedType(): void
    {
        $this->validator->assertAllowedMimeType('image/jpeg');
        $this->addToAssertionCount(1);
    }

    // --- Magic bytes: valid files ---

    public function testAcceptsJpeg(): void
    {
        file_put_contents($this->tmpFile, "\xFF\xD8\xFF\xE0" . str_repeat('x', 12));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsPng(): void
    {
        file_put_contents($this->tmpFile, "\x89PNG\r\n\x1A\n" . str_repeat('x', 8));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsGif87a(): void
    {
        file_put_contents($this->tmpFile, 'GIF87a' . str_repeat('x', 10));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsGif89a(): void
    {
        file_put_contents($this->tmpFile, 'GIF89a' . str_repeat('x', 10));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsWebP(): void
    {
        // RIFF????WEBP
        file_put_contents($this->tmpFile, 'RIFF' . "\x00\x00\x00\x00" . 'WEBP' . str_repeat('x', 4));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsBmp(): void
    {
        file_put_contents($this->tmpFile, 'BM' . str_repeat('x', 14));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsTiffLittleEndian(): void
    {
        file_put_contents($this->tmpFile, "II*\x00" . str_repeat('x', 12));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsTiffBigEndian(): void
    {
        file_put_contents($this->tmpFile, "MM\x00*" . str_repeat('x', 12));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsMp4(): void
    {
        // ftyp box at offset 4
        file_put_contents($this->tmpFile, "\x00\x00\x00\x20" . 'ftypisom' . str_repeat('x', 4));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsAvi(): void
    {
        // RIFF????AVI
        file_put_contents($this->tmpFile, 'RIFF' . "\x00\x00\x00\x00" . 'AVI ' . str_repeat('x', 4));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsWebm(): void
    {
        file_put_contents($this->tmpFile, "\x1A\x45\xDF\xA3" . str_repeat('x', 12));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsMpeg(): void
    {
        file_put_contents($this->tmpFile, "\x00\x00\x01\xB3" . str_repeat('x', 12));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    public function testAcceptsOgg(): void
    {
        file_put_contents($this->tmpFile, 'OggS' . str_repeat('x', 12));
        $this->validator->assertValidMagicBytes($this->tmpFile);
        $this->addToAssertionCount(1);
    }

    // --- Magic bytes: invalid files ---

    public function testRejectsPlainText(): void
    {
        $this->expectException(RuntimeException::class);
        file_put_contents($this->tmpFile, 'Hello, world! This is plain text content.');
        $this->validator->assertValidMagicBytes($this->tmpFile);
    }

    public function testRejectsPhpScript(): void
    {
        $this->expectException(RuntimeException::class);
        file_put_contents($this->tmpFile, "<?php echo 'hello'; ?>");
        $this->validator->assertValidMagicBytes($this->tmpFile);
    }

    public function testRejectsPdf(): void
    {
        $this->expectException(RuntimeException::class);
        file_put_contents($this->tmpFile, '%PDF-1.4 fake pdf content here');
        $this->validator->assertValidMagicBytes($this->tmpFile);
    }

    public function testRejectsEmptyFile(): void
    {
        $this->expectException(RuntimeException::class);
        file_put_contents($this->tmpFile, '');
        $this->validator->assertValidMagicBytes($this->tmpFile);
    }

    public function testRejectsRiffWithoutValidSubtype(): void
    {
        // RIFF container but not AVI or WEBP
        $this->expectException(RuntimeException::class);
        file_put_contents($this->tmpFile, 'RIFF' . "\x00\x00\x00\x00" . 'WAVE' . str_repeat('x', 4));
        $this->validator->assertValidMagicBytes($this->tmpFile);
    }
}
