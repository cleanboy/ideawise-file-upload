<?php

namespace App\Tests\Controller;

use App\Entity\UploadSession;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

class MonitoringControllerTest extends WebTestCase
{
    private KernelBrowser $client;
    private EntityManagerInterface $entityManager;

    protected function setUp(): void
    {
        self::ensureKernelShutdown();
        $this->client = static::createClient();
        $this->entityManager = static::getContainer()->get(EntityManagerInterface::class);
        $this->resetDatabase();
    }

    public function testMetricsReturnsCorrectStructureOnEmptyDatabase(): void
    {
        $this->client->request('GET', '/api/monitoring/metrics');

        self::assertSame(200, $this->client->getResponse()->getStatusCode());

        $data = $this->jsonResponse();

        self::assertArrayHasKey('activeUploads', $data);
        self::assertArrayHasKey('successRate', $data);
        self::assertArrayHasKey('systemLoad', $data);
        self::assertArrayHasKey('totals', $data);
        self::assertArrayHasKey('generatedAt', $data);

        self::assertSame(0, $data['activeUploads']['count']);
        self::assertSame([], $data['activeUploads']['sessions']);

        self::assertSame('24h', $data['successRate']['window']);
        self::assertSame(0, $data['successRate']['completed']);
        self::assertSame(0, $data['successRate']['failed']);
        self::assertNull($data['successRate']['rate']);

        self::assertArrayHasKey('loadAvg1m', $data['systemLoad']);
        self::assertArrayHasKey('memoryUsedBytes', $data['systemLoad']);
    }

    public function testMetricsCountsActiveUploadSessions(): void
    {
        $this->persistSession('active1.mp4', UploadSession::STATUS_UPLOADING);
        $this->persistSession('active2.mp4', UploadSession::STATUS_INITIATED);
        $this->entityManager->flush();

        $this->client->request('GET', '/api/monitoring/metrics');
        $data = $this->jsonResponse();

        self::assertSame(2, $data['activeUploads']['count']);
        self::assertCount(2, $data['activeUploads']['sessions']);
    }

    public function testMetricsListsActiveSessionDetails(): void
    {
        $this->persistSession('video.mp4', UploadSession::STATUS_UPLOADING);
        $this->entityManager->flush();

        $this->client->request('GET', '/api/monitoring/metrics');
        $data = $this->jsonResponse();

        $session = $data['activeUploads']['sessions'][0];
        self::assertArrayHasKey('uploadId', $session);
        self::assertArrayHasKey('filename', $session);
        self::assertArrayHasKey('progress', $session);
        self::assertArrayHasKey('fileSize', $session);
        self::assertSame('video.mp4', $session['filename']);
    }

    public function testMetricsCalculatesSuccessRateFrom24hWindow(): void
    {
        $completed = $this->persistSession('ok.jpg', UploadSession::STATUS_COMPLETED);
        $completed->complete('/var/uploads/ok.jpg', md5('ok'));

        $failed = $this->persistSession('bad.jpg', UploadSession::STATUS_FAILED);
        $failed->fail();

        $this->entityManager->flush();

        $this->client->request('GET', '/api/monitoring/metrics');
        $data = $this->jsonResponse();

        self::assertSame(1, $data['successRate']['completed']);
        self::assertSame(1, $data['successRate']['failed']);
        self::assertEquals(50.0, $data['successRate']['rate']);
    }

    public function testMetricsAggregatesTotalsAcrossAllStatuses(): void
    {
        $this->persistSession('a.jpg', UploadSession::STATUS_COMPLETED)->complete('/a', md5('a'));
        $this->persistSession('b.jpg', UploadSession::STATUS_UPLOADING);
        $this->entityManager->flush();

        $this->client->request('GET', '/api/monitoring/metrics');
        $data = $this->jsonResponse();

        self::assertGreaterThanOrEqual(1, $data['totals'][UploadSession::STATUS_COMPLETED] ?? 0);
        self::assertGreaterThanOrEqual(1, $data['totals'][UploadSession::STATUS_UPLOADING] ?? 0);
    }

    private function persistSession(string $filename, string $status): UploadSession
    {
        $session = new UploadSession(
            sprintf('%s-%s', uniqid('', true), $filename),
            $filename,
            'image/jpeg',
            1_048_576,
            1_048_576,
            1,
        );

        // Force the status by using the appropriate state transition method.
        match ($status) {
            UploadSession::STATUS_UPLOADING => $session->markChunkUploaded(0),
            UploadSession::STATUS_FAILED => $session->fail(),
            UploadSession::STATUS_CANCELLED => $session->cancel(),
            UploadSession::STATUS_EXPIRED => $session->expire(),
            default => null,
        };

        $this->entityManager->persist($session);

        return $session;
    }

    /**
     * @return array<string, mixed>
     */
    private function jsonResponse(): array
    {
        $content = $this->client->getResponse()->getContent();
        self::assertIsString($content);

        return json_decode($content, true, 512, JSON_THROW_ON_ERROR);
    }

    private function resetDatabase(): void
    {
        $metadata = $this->entityManager->getMetadataFactory()->getAllMetadata();

        if ($metadata === []) {
            return;
        }

        $schemaTool = new SchemaTool($this->entityManager);

        try {
            $schemaTool->dropSchema($metadata);
        } catch (\Throwable) {
        }

        $schemaTool->createSchema($metadata);
    }
}
