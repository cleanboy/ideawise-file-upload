<?php

namespace App\Controller;

use App\Entity\UploadSession;
use App\Repository\UploadSessionRepository;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use JsonException;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/monitoring')]
class MonitoringController extends AbstractController
{
    public function __construct(
        private readonly UploadSessionRepository $uploadSessions,
        private readonly EntityManagerInterface $entityManager,
    ) {
    }

    #[Route('/metrics', methods: ['GET'])]
    public function metrics(): JsonResponse
    {
        return $this->json($this->buildMetrics());
    }

    #[Route('/stream', methods: ['GET'])]
    public function liveStream(): StreamedResponse
    {
        return new StreamedResponse(function () {
            while (ob_get_level() > 0) {
                ob_end_clean();
            }

            while (!connection_aborted()) {
                // Clear the identity map so each tick reads fresh data from the DB
                // rather than returning cached entity objects from the first tick.
                $this->entityManager->clear();

                try {
                    echo 'data: ' . json_encode($this->buildMetrics(), JSON_THROW_ON_ERROR) . "\n\n";
                } catch (JsonException) {
                    echo "data: {}\n\n";
                }

                flush();
                sleep(5);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function buildMetrics(): array
    {
        $statusCounts = $this->uploadSessions->getStatusCounts();
        $last24h = $this->uploadSessions->getLast24hOutcomes();
        $activeSessions = $this->uploadSessions->findActive();

        $activeCount = ($statusCounts[UploadSession::STATUS_INITIATED] ?? 0)
            + ($statusCounts[UploadSession::STATUS_UPLOADING] ?? 0);

        $completed = $last24h['completed'];
        $failed = $last24h['failed'];
        $successRate = ($completed + $failed) > 0
            ? round($completed / ($completed + $failed) * 100, 1)
            : null;

        $load = sys_getloadavg();

        return [
            'activeUploads' => [
                'count' => $activeCount,
                'sessions' => array_map(fn(UploadSession $s) => [
                    'uploadId' => $s->getId(),
                    'filename' => $s->getOriginalFilename(),
                    'progress' => $s->getProgressPercent(),
                    'fileSize' => $s->getFileSize(),
                ], $activeSessions),
            ],
            'successRate' => [
                'window' => '24h',
                'completed' => $completed,
                'failed' => $failed,
                'rate' => $successRate,
                'throughputBytes' => $last24h['throughputBytes'],
            ],
            'systemLoad' => [
                'loadAvg1m' => $load !== false ? $load[0] : null,
                'loadAvg5m' => $load !== false ? $load[1] : null,
                'loadAvg15m' => $load !== false ? $load[2] : null,
                'memoryUsedBytes' => memory_get_usage(true),
                'memoryPeakBytes' => memory_get_peak_usage(true),
            ],
            'totals' => $statusCounts,
            'generatedAt' => (new DateTimeImmutable())->format(DATE_ATOM),
        ];
    }
}
