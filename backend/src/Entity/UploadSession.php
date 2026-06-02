<?php

namespace App\Entity;

use App\Repository\UploadSessionRepository;
use DateTimeImmutable;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: UploadSessionRepository::class)]
#[ORM\Table(name: 'upload_sessions')]
class UploadSession
{
    public const STATUS_INITIATED = 'initiated';
    public const STATUS_UPLOADING = 'uploading';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_CANCELLED = 'cancelled';
    public const STATUS_FAILED = 'failed';

    #[ORM\Id]
    #[ORM\Column(type: Types::GUID)]
    private string $id;

    #[ORM\Column(length: 255)]
    private string $originalFilename;

    #[ORM\Column(length: 128)]
    private string $mimeType;

    #[ORM\Column(type: Types::BIGINT)]
    private string $fileSize;

    #[ORM\Column]
    private int $chunkSize;

    #[ORM\Column]
    private int $totalChunks;

    #[ORM\Column(length: 32)]
    private string $status = self::STATUS_INITIATED;

    /**
     * @var int[]
     */
    #[ORM\Column(type: Types::JSON)]
    private array $uploadedChunks = [];

    #[ORM\Column(length: 1024, nullable: true)]
    private ?string $finalPath = null;

    #[ORM\Column]
    private DateTimeImmutable $createdAt;

    #[ORM\Column]
    private DateTimeImmutable $updatedAt;

    #[ORM\Column(nullable: true)]
    private ?DateTimeImmutable $completedAt = null;

    public function __construct(
        string $id,
        string $originalFilename,
        string $mimeType,
        int $fileSize,
        int $chunkSize,
        int $totalChunks,
    ) {
        $now = new DateTimeImmutable();

        $this->id = $id;
        $this->originalFilename = $originalFilename;
        $this->mimeType = $mimeType;
        $this->fileSize = (string) $fileSize;
        $this->chunkSize = $chunkSize;
        $this->totalChunks = $totalChunks;
        $this->createdAt = $now;
        $this->updatedAt = $now;
    }

    public function getId(): string
    {
        return $this->id;
    }

    public function getOriginalFilename(): string
    {
        return $this->originalFilename;
    }

    public function getMimeType(): string
    {
        return $this->mimeType;
    }

    public function getFileSize(): int
    {
        return (int) $this->fileSize;
    }

    public function getChunkSize(): int
    {
        return $this->chunkSize;
    }

    public function getTotalChunks(): int
    {
        return $this->totalChunks;
    }

    public function getStatus(): string
    {
        return $this->status;
    }

    /**
     * @return int[]
     */
    public function getUploadedChunks(): array
    {
        return $this->uploadedChunks;
    }

    public function getUploadedChunkCount(): int
    {
        return count($this->uploadedChunks);
    }

    public function getProgressPercent(): float
    {
        if ($this->totalChunks === 0) {
            return 0.0;
        }

        return round(($this->getUploadedChunkCount() / $this->totalChunks) * 100, 2);
    }

    public function getCreatedAt(): DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function getUpdatedAt(): DateTimeImmutable
    {
        return $this->updatedAt;
    }

    public function getCompletedAt(): ?DateTimeImmutable
    {
        return $this->completedAt;
    }

    public function markChunkUploaded(int $chunkIndex): void
    {
        if (!in_array($chunkIndex, $this->uploadedChunks, true)) {
            $this->uploadedChunks[] = $chunkIndex;
            sort($this->uploadedChunks, SORT_NUMERIC);
        }

        if ($this->status === self::STATUS_INITIATED) {
            $this->status = self::STATUS_UPLOADING;
        }

        $this->touch();
    }

    /**
     * @param int[] $chunkIndexes
     */
    public function replaceUploadedChunks(array $chunkIndexes): void
    {
        $chunkIndexes = array_values(array_unique(array_map('intval', $chunkIndexes)));
        sort($chunkIndexes, SORT_NUMERIC);

        $this->uploadedChunks = $chunkIndexes;

        if ($this->uploadedChunks !== [] && $this->status === self::STATUS_INITIATED) {
            $this->status = self::STATUS_UPLOADING;
        }

        $this->touch();
    }

    public function complete(string $finalPath): void
    {
        $this->status = self::STATUS_COMPLETED;
        $this->finalPath = $finalPath;
        $this->completedAt = new DateTimeImmutable();
        $this->touch();
    }

    public function cancel(): void
    {
        $this->status = self::STATUS_CANCELLED;
        $this->touch();
    }

    public function fail(): void
    {
        $this->status = self::STATUS_FAILED;
        $this->touch();
    }

    public function canAcceptChunks(): bool
    {
        return in_array($this->status, [self::STATUS_INITIATED, self::STATUS_UPLOADING], true);
    }

    public function hasAllChunks(): bool
    {
        return $this->getUploadedChunkCount() === $this->totalChunks;
    }

    private function touch(): void
    {
        $this->updatedAt = new DateTimeImmutable();
    }
}
