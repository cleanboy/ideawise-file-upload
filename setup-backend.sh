#!/bin/bash
set -e

echo "==> Creating Symfony project..."
docker compose run --rm php composer create-project symfony/skeleton:^6.4 . --no-interaction

echo "==> Installing required Symfony packages..."
docker compose run --rm php composer require \
    symfony/orm-pack \
    symfony/maker-bundle \
    nelmio/cors-bundle \
    symfony/validator \
    symfony/serializer-pack \
    predis/predis \
    --no-interaction

echo "==> Installing dev dependencies..."
docker compose run --rm php composer require --dev \
    symfony/test-pack \
    phpunit/phpunit \
    --no-interaction

echo "==> Done! Symfony is ready."
echo "    API will be available at http://localhost:8080"