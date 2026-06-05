<?php

namespace App\Repository;

use App\Entity\UploadSession;
use DateTimeImmutable;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<UploadSession>
 */
class UploadSessionRepository extends ServiceEntityRepository
{
    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, UploadSession::class);
    }

    /**
     * Returns completed sessions whose file is safe to delete: every session pointing to
     * the same finalPath has completedAt older than $olderThan (handles dedup-shared paths).
     *
     * @return UploadSession[]
     */
    public function findPurgeable(DateTimeImmutable $olderThan): array
    {
        // Subquery: finalPaths still held by recently-completed sessions.
        $recentPaths = $this->createQueryBuilder('s2')
            ->select('s2.finalPath')
            ->where('s2.status = :status')
            ->andWhere('s2.finalPath IS NOT NULL')
            ->andWhere('s2.completedAt >= :cutoff');

        return $this->createQueryBuilder('s')
            ->where('s.status = :status')
            ->andWhere('s.finalPath IS NOT NULL')
            ->andWhere('s.completedAt < :cutoff')
            ->andWhere($this->createQueryBuilder('s')->expr()->notIn('s.finalPath', $recentPaths->getDQL()))
            ->setParameter('status', UploadSession::STATUS_COMPLETED)
            ->setParameter('cutoff', $olderThan)
            ->getQuery()
            ->getResult();
    }

    public function findCompletedByChecksum(string $checksum): ?UploadSession
    {
        return $this->createQueryBuilder('s')
            ->where('s.status = :status')
            ->andWhere('s.checksum = :checksum')
            ->setParameter('status', UploadSession::STATUS_COMPLETED)
            ->setParameter('checksum', $checksum)
            ->setMaxResults(1)
            ->getQuery()
            ->getOneOrNullResult();
    }

    /**
     * @return array<string, int>  status => count for every status present in the table
     */
    public function getStatusCounts(): array
    {
        $rows = $this->createQueryBuilder('s')
            ->select('s.status', 'COUNT(s.id) AS cnt')
            ->groupBy('s.status')
            ->getQuery()
            ->getResult();

        $counts = [];
        foreach ($rows as $row) {
            $counts[$row['status']] = (int) $row['cnt'];
        }

        return $counts;
    }

    /**
     * @return array{completed: int, failed: int, throughputBytes: int}
     */
    public function getLast24hOutcomes(): array
    {
        $since = new DateTimeImmutable('-24 hours');

        $rows = $this->createQueryBuilder('s')
            ->select('s.status', 'COUNT(s.id) AS cnt', 'SUM(s.fileSize) AS totalBytes')
            ->where('s.updatedAt >= :since')
            ->andWhere('s.status IN (:statuses)')
            ->setParameter('since', $since)
            ->setParameter('statuses', [UploadSession::STATUS_COMPLETED, UploadSession::STATUS_FAILED])
            ->groupBy('s.status')
            ->getQuery()
            ->getResult();

        $result = ['completed' => 0, 'failed' => 0, 'throughputBytes' => 0];

        foreach ($rows as $row) {
            if ($row['status'] === UploadSession::STATUS_COMPLETED) {
                $result['completed'] = (int) $row['cnt'];
                $result['throughputBytes'] = (int) $row['totalBytes'];
            } elseif ($row['status'] === UploadSession::STATUS_FAILED) {
                $result['failed'] = (int) $row['cnt'];
            }
        }

        return $result;
    }

    /**
     * Returns all sessions currently being uploaded, newest first.
     *
     * @return UploadSession[]
     */
    public function findActive(): array
    {
        return $this->createQueryBuilder('s')
            ->where('s.status IN (:statuses)')
            ->setParameter('statuses', [UploadSession::STATUS_INITIATED, UploadSession::STATUS_UPLOADING])
            ->orderBy('s.updatedAt', 'DESC')
            ->getQuery()
            ->getResult();
    }

    /**
     * Returns in-progress sessions that have not been updated since $olderThan.
     *
     * @return UploadSession[]
     */
    public function findStaleIncomplete(DateTimeImmutable $olderThan): array
    {
        return $this->createQueryBuilder('s')
            ->where('s.status IN (:statuses)')
            ->andWhere('s.updatedAt < :cutoff')
            ->setParameter('statuses', [UploadSession::STATUS_INITIATED, UploadSession::STATUS_UPLOADING])
            ->setParameter('cutoff', $olderThan)
            ->getQuery()
            ->getResult();
    }
}
