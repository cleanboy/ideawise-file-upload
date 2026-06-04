<?php

namespace App\Tests\Command;

use App\Command\CleanUpIncompleteUploadsCommand;
use App\Entity\UploadSession;
use App\Repository\UploadSessionRepository;
use App\Service\UploadStorage;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Console\Tester\CommandTester;

class CleanUpIncompleteUploadsCommandTest extends KernelTestCase
{
    private EntityManagerInterface $entityManager;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->entityManager = static::getContainer()->get(EntityManagerInterface::class);
        $this->resetDatabase();
    }

    public function testExpiresStaleSessionsAndRemovesChunks(): void
    {
        $storage = $this->storage();

        $stale = $this->createSession('stale.jpg', 'image/jpeg');
        $this->setUpdatedAt($stale, '-31 minutes');
        $this->entityManager->flush();

        $storage->writeChunk($stale->getId(), 0, 'abc');
        self::assertNotSame([], $storage->getStoredChunkIndexes($stale->getId()));

        $tester = $this->runCommand();

        self::assertSame(0, $tester->getStatusCode());
        self::assertStringContainsString('Expired 1 incomplete upload', $tester->getDisplay());

        $this->entityManager->clear();
        $refreshed = $this->repository()->find($stale->getId());

        self::assertInstanceOf(UploadSession::class, $refreshed);
        self::assertSame(UploadSession::STATUS_EXPIRED, $refreshed->getStatus());
        self::assertSame([], $storage->getStoredChunkIndexes($stale->getId()));
    }

    public function testDoesNotExpireRecentSessions(): void
    {
        $recent = $this->createSession('recent.jpg', 'image/jpeg');
        $this->setUpdatedAt($recent, '-10 minutes');
        $this->entityManager->flush();

        $tester = $this->runCommand();

        self::assertSame(0, $tester->getStatusCode());
        self::assertStringContainsString('No stale incomplete uploads found', $tester->getDisplay());

        $this->entityManager->clear();
        $refreshed = $this->repository()->find($recent->getId());

        self::assertInstanceOf(UploadSession::class, $refreshed);
        self::assertSame(UploadSession::STATUS_INITIATED, $refreshed->getStatus());
    }

    public function testDoesNotExpireCompletedOrCancelledSessions(): void
    {
        $completed = $this->createSession('done.jpg', 'image/jpeg');
        $completed->complete('/fake/path/done.jpg', md5('fake'));
        $this->setUpdatedAt($completed, '-60 minutes');

        $cancelled = $this->createSession('cancelled.jpg', 'image/jpeg');
        $cancelled->cancel();
        $this->setUpdatedAt($cancelled, '-60 minutes');

        $this->entityManager->flush();

        $tester = $this->runCommand();

        self::assertSame(0, $tester->getStatusCode());
        self::assertStringContainsString('No stale incomplete uploads found', $tester->getDisplay());
    }

    public function testExpiresMultipleStaleSessions(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $session = $this->createSession("file{$i}.jpg", 'image/jpeg');
            $this->setUpdatedAt($session, '-45 minutes');
        }
        $this->entityManager->flush();

        $tester = $this->runCommand();

        self::assertSame(0, $tester->getStatusCode());
        self::assertStringContainsString('Expired 3 incomplete upload', $tester->getDisplay());
    }

    public function testCustomTimeoutOption(): void
    {
        $session = $this->createSession('borderline.jpg', 'image/jpeg');
        $this->setUpdatedAt($session, '-20 minutes');
        $this->entityManager->flush();

        // Should be kept with the default 30-minute window.
        $tester = $this->runCommand(['--timeout' => 30]);
        self::assertStringContainsString('No stale incomplete uploads found', $tester->getDisplay());

        // Should be expired with a 15-minute window.
        $tester = $this->runCommand(['--timeout' => 15]);
        self::assertStringContainsString('Expired 1 incomplete upload', $tester->getDisplay());
    }

    public function testRejectsInvalidTimeout(): void
    {
        $tester = $this->runCommand(['--timeout' => 0]);
        self::assertSame(1, $tester->getStatusCode());
    }

    private function runCommand(array $input = []): CommandTester
    {
        $application = new Application(static::$kernel);
        $tester = new CommandTester($application->find('app:cleanup-uploads'));
        $tester->execute($input);

        return $tester;
    }

    private function createSession(string $filename, string $mimeType): UploadSession
    {
        $session = new UploadSession(
            bin2hex(random_bytes(16)),
            $filename,
            $mimeType,
            1024,
            512,
            2,
        );

        $this->entityManager->persist($session);

        return $session;
    }

    private function setUpdatedAt(UploadSession $session, string $modifier): void
    {
        // Reach in via reflection to backdate updatedAt for test setup.
        $property = new \ReflectionProperty(UploadSession::class, 'updatedAt');
        $property->setValue($session, new \DateTimeImmutable($modifier));
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

    private function storage(): UploadStorage
    {
        return static::getContainer()->get(UploadStorage::class);
    }

    private function repository(): UploadSessionRepository
    {
        return static::getContainer()->get(UploadSessionRepository::class);
    }
}
