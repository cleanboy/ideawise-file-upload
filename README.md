# Media File Upload System

A cross-platform media file upload solution supporting web and mobile, with chunked upload, pause/resume, and concurrency control.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Symfony 6.4 (PHP 8.2) |
| Database | MySQL 8.0 |
| Cache | Redis |
| Web Frontend | React + TypeScript (Vite) |
| Mobile | React Native (Expo) |
| Dev Environment | Docker + Docker Compose |

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Node.js 18+](https://nodejs.org/) (for mobile development)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (for mobile)

## Getting Started

### 1. Clone the repository

```bash
git clone <repo-url>
cd <project-name>
```

### 2. Start the Docker environment

```bash
docker compose up -d
```

### 3. Install Symfony dependencies (first time only)

```bash
docker compose exec php composer install
```

### 4. Run database migrations

```bash
docker compose exec php php bin/console doctrine:migrations:migrate --no-interaction
```

### 5. Access the services

| Service | URL |
|---|---|
| Backend API | http://localhost:8080 |
| MySQL | localhost:3306 |
| Redis | localhost:6379 |

### 6. Web frontend (coming soon)

```bash
cd web
npm install
npm run dev
```

### 7. Mobile app (coming soon)

```bash
cd mobile
npm install
npx expo start
```

## Project Structure

```
/
├── backend/          # Symfony 6.4 API
├── web/              # React + TypeScript frontend
├── mobile/           # React Native (Expo) app
├── docker/
│   ├── nginx/        # Nginx configuration
│   └── php/          # PHP-FPM Dockerfile
├── docker-compose.yml
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/upload/initiate` | Start a new upload session |
| POST | `/api/upload/chunk` | Upload a single chunk |
| POST | `/api/upload/finalize` | Reassemble chunks into final file |
| GET | `/api/upload/status/{id}` | Query upload status |

## Running Tests

```bash
docker compose exec php php bin/phpunit
```