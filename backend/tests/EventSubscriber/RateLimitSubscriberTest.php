<?php

namespace App\Tests\EventSubscriber;

use App\EventSubscriber\RateLimitSubscriber;
use App\Service\UploadApiLimiter;
use DateTimeImmutable;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Symfony\Component\RateLimiter\LimiterInterface;
use Symfony\Component\RateLimiter\RateLimit;

class RateLimitSubscriberTest extends TestCase
{
    private UploadApiLimiter&MockObject $limiterService;
    private LimiterInterface&MockObject $limiter;
    private RateLimitSubscriber $subscriber;

    protected function setUp(): void
    {
        $this->limiterService = $this->createMock(UploadApiLimiter::class);
        $this->limiter = $this->createMock(LimiterInterface::class);
        $this->limiterService->method('create')->willReturn($this->limiter);
        $this->subscriber = new RateLimitSubscriber($this->limiterService);
    }

    public function testAllowsRequestWhenLimitNotReached(): void
    {
        $this->limiter->method('consume')->willReturn($this->rateLimit(accepted: true));

        $event = $this->makeEvent(Request::create('/api/upload/initiate'));
        $this->subscriber->onKernelRequest($event);

        self::assertNull($event->getResponse());
    }

    public function testBlocksRequestWhenLimitExceeded(): void
    {
        $this->limiter->method('consume')->willReturn(
            $this->rateLimit(accepted: false, remaining: 0, retryAfter: new DateTimeImmutable('+60 seconds')),
        );

        $event = $this->makeEvent(Request::create('/api/upload/initiate'));
        $this->subscriber->onKernelRequest($event);

        $response = $event->getResponse();
        self::assertInstanceOf(JsonResponse::class, $response);
        self::assertSame(429, $response->getStatusCode());

        $body = json_decode($response->getContent(), true);
        self::assertSame('rate_limit_exceeded', $body['error']['code']);
    }

    public function testBlockedResponseCarriesRateLimitHeaders(): void
    {
        $retryAfter = new DateTimeImmutable('+45 seconds');
        $this->limiter->method('consume')->willReturn(
            $this->rateLimit(accepted: false, remaining: 0, retryAfter: $retryAfter),
        );

        $event = $this->makeEvent(Request::create('/api/upload/initiate'));
        $this->subscriber->onKernelRequest($event);

        $headers = $event->getResponse()->headers;
        self::assertSame('10', $headers->get('X-RateLimit-Limit'));
        self::assertSame('0', $headers->get('X-RateLimit-Remaining'));
        self::assertNotNull($headers->get('Retry-After'));
    }

    public function testSkipsNonInitiatePaths(): void
    {
        $this->limiterService->expects(self::never())->method('create');

        foreach (['/api/upload/chunk', '/api/upload/finalize', '/api/upload/status/abc', '/api/upload/cancel/abc'] as $path) {
            $event = $this->makeEvent(Request::create($path));
            $this->subscriber->onKernelRequest($event);
            self::assertNull($event->getResponse(), "Expected no rate limit response for $path");
        }
    }

    public function testSkipsNonUploadPaths(): void
    {
        $this->limiterService->expects(self::never())->method('create');

        $event = $this->makeEvent(Request::create('/api/other/resource'));
        $this->subscriber->onKernelRequest($event);

        self::assertNull($event->getResponse());
    }

    public function testSkipsSubRequests(): void
    {
        $this->limiterService->expects(self::never())->method('create');

        $kernel = $this->createMock(HttpKernelInterface::class);
        $event = new RequestEvent($kernel, Request::create('/api/upload/status/abc'), HttpKernelInterface::SUB_REQUEST);
        $this->subscriber->onKernelRequest($event);

        self::assertNull($event->getResponse());
    }

    public function testUsesClientIpAsLimiterKey(): void
    {
        $this->limiter->method('consume')->willReturn($this->rateLimit(accepted: true));

        $request = Request::create('/api/upload/initiate');
        $request->server->set('REMOTE_ADDR', '203.0.113.5');

        $this->limiterService->expects(self::once())->method('create')->with('203.0.113.5');

        $this->subscriber->onKernelRequest($this->makeEvent($request));
    }

    public function testSubscribesToKernelRequestEvent(): void
    {
        $events = RateLimitSubscriber::getSubscribedEvents();
        self::assertArrayHasKey('kernel.request', $events);
    }

    private function makeEvent(Request $request): RequestEvent
    {
        $kernel = $this->createMock(HttpKernelInterface::class);

        return new RequestEvent($kernel, $request, HttpKernelInterface::MAIN_REQUEST);
    }

    private function rateLimit(
        bool $accepted,
        int $remaining = 5,
        DateTimeImmutable $retryAfter = null,
    ): RateLimit {
        $mock = $this->createMock(RateLimit::class);
        $mock->method('isAccepted')->willReturn($accepted);
        $mock->method('getRemainingTokens')->willReturn($remaining);
        $mock->method('getRetryAfter')->willReturn($retryAfter ?? new DateTimeImmutable('+60 seconds'));

        return $mock;
    }
}
