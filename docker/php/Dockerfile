FROM php:8.2-fpm

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    libpng-dev \
    libonig-dev \
    libxml2-dev \
    libzip-dev \
    zip \
    unzip \
    && docker-php-ext-install pdo_mysql mbstring exif pcntl bcmath gd zip \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/backend

# Use default production configuration as base
RUN mv "$PHP_INI_DIR/php.ini-development" "$PHP_INI_DIR/php.ini"

# Increase upload limits for file upload assignment
RUN echo "upload_max_filesize=512M" >> "$PHP_INI_DIR/php.ini" \
    && echo "post_max_size=512M" >> "$PHP_INI_DIR/php.ini" \
    && echo "max_execution_time=300" >> "$PHP_INI_DIR/php.ini"

CMD ["php-fpm"]