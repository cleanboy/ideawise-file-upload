<?php

namespace App\Command;

use App\Repository\UploadSessionRepository;
use App\Service\UploadStorage;
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
    name: 'app:cleanup-uploads',
    description: 'Expires incomplete upload sessions and removes their temporary chunks.',
)]
class CleanUpIncompleteUploadsCommand extends Command
{
    public function __construct(
        private readonly EntityManagerInterface $entityManager,
        private readonly UploadSessionRepository $uploadSessions,
        private readonly UploadStorage $storage,
        private readonly LoggerInterface $logger,
    ) {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption(
            'timeout',
            't',
            InputOption::VALUE_REQUIRED,
            'Expire sessions idle for longer than this many minutes.',
            30,
        );
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $timeout = (int) $input->getOption('timeout');

        if ($timeout <= 0) {
            $io->error('--timeout must be a positive integer.');

            return Command::FAILURE;
        }

        $cutoff = new DateTimeImmutable(sprintf('-%d minutes', $timeout));
        $staleSessions = $this->uploadSessions->findStaleIncomplete($cutoff);

        if ($staleSessions === []) {
            $io->info('No stale incomplete uploads found.');
            $this->logger->info('Cleanup run: no stale incomplete uploads found', ['timeoutMinutes' => $timeout]);

            return Command::SUCCESS;
        }

        foreach ($staleSessions as $session) {
            $this->storage->removeUpload($session->getId());
            $session->expire();
            $this->logger->info('Incomplete upload expired', ['uploadId' => $session->getId()]);
        }

        $this->entityManager->flush();

        $io->success(sprintf('Expired %d incomplete upload(s) idle for more than %d minute(s).', count($staleSessions), $timeout));
        $this->logger->info('Cleanup run complete', ['expiredCount' => count($staleSessions), 'timeoutMinutes' => $timeout]);

        return Command::SUCCESS;
    }
}
