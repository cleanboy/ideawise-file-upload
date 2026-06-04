<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260604000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Add checksum column to upload_sessions for MD5-based deduplication';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('ALTER TABLE upload_sessions ADD checksum CHAR(32) DEFAULT NULL');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('ALTER TABLE upload_sessions DROP COLUMN checksum');
    }
}
