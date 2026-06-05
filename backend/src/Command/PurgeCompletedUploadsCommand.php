<?php

namespace App\Command;

use App\Repository\UploadSessionRepository;
use DateTimeImmutable;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Log\LoggerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

#[AsCommand(
    name: 'app:purge-uploads',
    description: 'Deletes completed upload files older than the retention period and marks their sessions as purged.',
)]
class PurgeCompletedUploadsCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly UploadSessionRepository $uploadSessions,
        private readonly LoggerInterface $logger,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption(
            'days',
            'd',
            InputOption::VALUE_REQUIRED,
            'Delete files from sessions completed more than this many days ago.',
            30,
        );
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $days = (int) $input->getOption('days');

        if ($days <= 0) {
            $io->error('--days must be a positive integer.');

            return Command::FAILURE;
        }

        $cutoff = new DateTimeImmutable(sprintf('-%d days', $days));
        $sessions = $this->uploadSessions->findPurgeable($cutoff);

        if ($sessions === []) {
            $io->info(sprintf('No completed uploads older than %d day(s) to purge.', $days));
            $this->logger->info('Purge run: no purgeable sessions found', ['retentionDays' => $days]);

            return Command::SUCCESS;
        }

        $deletedPaths = [];

        foreach ($sessions as $session) {
            $path = $session->getFinalPath();

            if ($path !== null && !in_array($path, $deletedPaths, true)) {
                if (is_file($path)) {
                    @unlink($path);
                    $this->logger->info('Purged file', ['path' => $path, 'uploadId' => $session->getId()]);
                } else {
                    $this->logger->warning('File not found during purge', ['path' => $path, 'uploadId' => $session->getId()]);
                }
                $deletedPaths[] = $path;
            }

            $session->purge();
        }

        $this->entityManager->flush();

        $io->success(sprintf(
            'Purged %d session(s) and deleted %d file(s) older than %d day(s).',
            count($sessions),
            count($deletedPaths),
            $days,
        ));
        $this->logger->info('Purge run complete', ['purgedSessions' => count($sessions), 'deletedFiles' => count($deletedPaths), 'retentionDays' => $days]);

        return Command::SUCCESS;
    }
}
