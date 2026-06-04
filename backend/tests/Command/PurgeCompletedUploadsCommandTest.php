<?php

namespace App\Tests\Command;

use App\Entity\UploadSession;
use App\Repository\UploadSessionRepository;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use ReflectionProperty;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Console\Tester\CommandTester;

class PurgeCompletedUploadsCommandTest extends KernelTestCase
{
    private EntityManagerInterface $entityManager;

    protected function setUp(): void
    {
        self::bootKernel();
        $this->entityManager = static::getContainer()->get(EntityManagerInterface::class);
        $this->resetDatabase();
    }

    public function testPurgesOldCompletedSessionAndDeletesFile(): void
    {
        $file = $this->makeTempFile();
        $session = $this->createCompletedSession('old.jpg', $file);
        $this->setCompletedAt($session, '-31 days');
        $this->entityManager->flush();

        self::assertFileExists($file);

        $tester = $this->runCommand();

        self::assertSame(0, $tester->getStatusCode());
        self::assertStringContainsString('Purged 1 session(s) and deleted 1 file(s)', $tester->getDisplay());

        self::assertFileDoesNotExist($file);

        $this->entityManager->clear();
        $refreshed = $this->repository()->find($session->getId());
        self::assertInstanceOf(UploadSession::class, $refreshed);
        self::assertSame(UploadSession::STATUS_PURGED, $refreshed->getStatus());
        self::assertNull($refreshed->getFinalPath());
    }

    public function testDoesNotPurgeRecentSessions(): void
    {
        $file = $this->makeTempFile();
        $session = $this->createCompletedSession('recent.jpg', $file);
        $this->setCompletedAt($session, '-5 days');
        $this->entityManager->flush();

        $tester = $this->runCommand();

        self::assertSame(0, $tester->getStatusCode());
        self::assertStringContainsString('No completed uploads', $tester->getDisplay());
        self::assertFileExists($file);

        $this->entityManager->clear();
        $refreshed = $this->repository()->find($session->getId());
        self::assertSame(UploadSession::STATUS_COMPLETED, $refreshed->getStatus());

        @unlink($file);
    }

    public function testDoesNotDeleteFileStillReferencedByRecentSession(): void
    {
        $file = $this->makeTempFile();
        $sharedPath = $file;

        // Old session pointing at the shared file.
        $old = $this->createCompletedSession('old.jpg', $sharedPath);
        $this->setCompletedAt($old, '-40 days');

        // Recent session pointing at the same file (deduplication scenario).
        $recent = $this->createCompletedSession('recent.jpg', $sharedPath);
        $this->setCompletedAt($recent, '-2 days');

        $this->entityManager->flush();

        $tester = $this->runCommand();

        self::assertSame(0, $tester->getStatusCode());
        // Neither session should be purged — the file is still needed by the recent one.
        self::assertStringContainsString('No completed uploads', $tester->getDisplay());
        self::assertFileExists($file);

        @unlink($file);
    }

    public function testDeletesFileOnceWhenSharedByMultipleOldSessions(): void
    {
        $file = $this->makeTempFile();

        $first = $this->createCompletedSession('a.jpg', $file);
        $this->setCompletedAt($first, '-35 days');

        $second = $this->createCompletedSession('b.jpg', $file);
        $this->setCompletedAt($second, '-32 days');

        $this->entityManager->flush();

        $tester = $this->runCommand();

        self::assertSame(0, $tester->getStatusCode());
        self::assertStringContainsString('Purged 2 session(s) and deleted 1 file(s)', $tester->getDisplay());
        self::assertFileDoesNotExist($file);

        $this->entityManager->clear();
        self::assertSame(UploadSession::STATUS_PURGED, $this->repository()->find($first->getId())->getStatus());
        self::assertSame(UploadSession::STATUS_PURGED, $this->repository()->find($second->getId())->getStatus());
    }

    public function testCustomRetentionDays(): void
    {
        $file = $this->makeTempFile();
        $session = $this->createCompletedSession('borderline.jpg', $file);
        $this->setCompletedAt($session, '-20 days');
        $this->entityManager->flush();

        // 30-day window: should not purge.
        $tester = $this->runCommand(['--days' => 30]);
        self::assertStringContainsString('No completed uploads', $tester->getDisplay());
        self::assertFileExists($file);

        // 15-day window: should purge.
        $tester = $this->runCommand(['--days' => 15]);
        self::assertStringContainsString('Purged 1 session(s)', $tester->getDisplay());
        self::assertFileDoesNotExist($file);
    }

    public function testRejectsInvalidDays(): void
    {
        $tester = $this->runCommand(['--days' => 0]);
        self::assertSame(1, $tester->getStatusCode());
    }

    public function testSkipsAlreadyDeletedFile(): void
    {
        $path = sys_get_temp_dir().'/purge-test-gone-'.bin2hex(random_bytes(4)).'.jpg';
        // File was never created (or already gone).

        $session = $this->createCompletedSession('gone.jpg', $path);
        $this->setCompletedAt($session, '-31 days');
        $this->entityManager->flush();

        // Should not throw even though the file doesn't exist.
        $tester = $this->runCommand();
        self::assertSame(0, $tester->getStatusCode());
        self::assertStringContainsString('Purged 1 session(s)', $tester->getDisplay());
    }

    private function runCommand(array $input = []): CommandTester
    {
        $application = new Application(static::$kernel);
        $tester = new CommandTester($application->find('app:purge-uploads'));
        $tester->execute($input);

        return $tester;
    }

    private function createCompletedSession(string $filename, string $path): UploadSession
    {
        $session = new UploadSession(
            bin2hex(random_bytes(16)),
            $filename,
            'image/jpeg',
            1024,
            512,
            2,
        );
        $session->complete($path, md5($path));
        $this->entityManager->persist($session);

        return $session;
    }

    private function setCompletedAt(UploadSession $session, string $modifier): void
    {
        $prop = new ReflectionProperty(UploadSession::class, 'completedAt');
        $prop->setValue($session, new DateTimeImmutable($modifier));
    }

    private function makeTempFile(): string
    {
        $path = tempnam(sys_get_temp_dir(), 'purge-test-');
        self::assertIsString($path);
        file_put_contents($path, "\xFF\xD8\xFF" . str_repeat('x', 64));

        return $path;
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

    private function repository(): UploadSessionRepository
    {
        return static::getContainer()->get(UploadSessionRepository::class);
    }
}
