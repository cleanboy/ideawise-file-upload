<?php

namespace App\Service;

use RuntimeException;

class FileTypeValidator
{
    private const ALLOWED_MIME_TYPES = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'image/bmp',
        'image/tiff',
        'image/heic',
        'image/heif',
        'video/mp4',
        'video/mpeg',
        'video/quicktime',
        'video/x-msvideo',
        'video/webm',
        'video/x-matroska',
        'video/ogg',
        'video/x-flv',
        'video/x-ms-wmv',
        'video/3gpp',
        'video/3gpp2',
    ];

    /**
     * Each entry is a list of constraint groups (OR logic between groups).
     * A constraint group is a list of [offset, bytes] pairs that ALL must match (AND logic).
     *
     * @var array<string, list<list<array{int, string}>>>
     */
    private const SIGNATURES = [
        'image/jpeg' => [
            [[0, "\xFF\xD8\xFF"]],
        ],
        'image/png' => [
            [[0, "\x89PNG\r\n\x1A\n"]],
        ],
        'image/gif' => [
            [[0, 'GIF87a']],
            [[0, 'GIF89a']],
        ],
        'image/webp' => [
            [[0, 'RIFF'], [8, 'WEBP']],
        ],
        'image/bmp' => [
            [[0, 'BM']],
        ],
        'image/tiff' => [
            [[0, "II*\x00"]],
            [[0, "MM\x00*"]],
        ],
        'image/heic' => [
            [[4, 'ftypheic']],
            [[4, 'ftypheix']],
        ],
        'image/heif' => [
            [[4, 'ftypmif1']],
            [[4, 'ftypmsf1']],
        ],
        'video/mp4' => [
            [[4, 'ftyp']],
        ],
        'video/quicktime' => [
            [[4, "ftypqt  "]],
            [[4, 'moov']],
        ],
        'video/x-msvideo' => [
            [[0, 'RIFF'], [8, 'AVI ']],
        ],
        'video/webm' => [
            [[0, "\x1A\x45\xDF\xA3"]],
        ],
        'video/x-matroska' => [
            [[0, "\x1A\x45\xDF\xA3"]],
        ],
        'video/mpeg' => [
            [[0, "\x00\x00\x01\xB3"]],
            [[0, "\x00\x00\x01\xBA"]],
        ],
        'video/ogg' => [
            [[0, 'OggS']],
        ],
        'video/x-flv' => [
            [[0, 'FLV']],
        ],
        'video/x-ms-wmv' => [
            [[0, "\x30\x26\xB2\x75"]],
        ],
        'video/3gpp' => [
            [[4, 'ftyp3gp']],
        ],
        'video/3gpp2' => [
            [[4, 'ftyp3g2']],
        ],
    ];

    public function isAllowedMimeType(string $mimeType): bool
    {
        return in_array(strtolower($mimeType), self::ALLOWED_MIME_TYPES, true);
    }

    public function assertAllowedMimeType(string $mimeType): void
    {
        if (!$this->isAllowedMimeType($mimeType)) {
            throw new RuntimeException(sprintf(
                'MIME type "%s" is not permitted. Only image and video files are accepted.',
                $mimeType,
            ));
        }
    }

    public function assertValidMagicBytes(string $filePath): void
    {
        $header = $this->readHeader($filePath, 16);

        foreach (self::SIGNATURES as $constraintGroups) {
            foreach ($constraintGroups as $group) {
                if ($this->groupMatches($header, $group)) {
                    return;
                }
            }
        }

        throw new RuntimeException('File content does not match any allowed media type.');
    }

    private function readHeader(string $filePath, int $length): string
    {
        $handle = fopen($filePath, 'rb');

        if ($handle === false) {
            throw new RuntimeException('Unable to open assembled file for validation.');
        }

        $header = fread($handle, $length);
        fclose($handle);

        if ($header === false) {
            throw new RuntimeException('Unable to read assembled file for validation.');
        }

        return $header;
    }

    /**
     * @param list<array{int, string}> $group
     */
    private function groupMatches(string $header, array $group): bool
    {
        foreach ($group as [$offset, $signature]) {
            $length = strlen($signature);

            if (strlen($header) < $offset + $length) {
                return false;
            }

            if (substr($header, $offset, $length) !== $signature) {
                return false;
            }
        }

        return true;
    }
}
