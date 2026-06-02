<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20260602120000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Create upload_sessions table';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE upload_sessions (id CHAR(36) NOT NULL COMMENT \'(DC2Type:guid)\', original_filename VARCHAR(255) NOT NULL, mime_type VARCHAR(128) NOT NULL, file_size BIGINT NOT NULL, chunk_size INT NOT NULL, total_chunks INT NOT NULL, status VARCHAR(32) NOT NULL, uploaded_chunks JSON NOT NULL, final_path VARCHAR(1024) DEFAULT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, completed_at DATETIME DEFAULT NULL, PRIMARY KEY(id)) DEFAULT CHARACTER SET utf8mb4 COLLATE `utf8mb4_unicode_ci` ENGINE = InnoDB');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE upload_sessions');
    }
}
