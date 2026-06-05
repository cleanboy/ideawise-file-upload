<?php

namespace App\Tests\EventSubscriber;

use App\EventSubscriber\AuditLogSubscriber;
use PHPUnit\Framework\MockObject\MockObject;
use PHPUnit\Framework\TestCase;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\HttpKernelInterface;
use Symfony\Component\HttpKernel\KernelEvents;

class AuditLogSubscriberTest extends TestCase
{
    private LoggerInterface&MockObject $logger;
    private AuditLogSubscriber $subscriber;

    protected function setUp(): void
    {
        $this->logger = $this->createMock(LoggerInterface::class);
        $this->subscriber = new AuditLogSubscriber($this->logger);
    }

    public function testLogsUploadApiRequest(): void
    {
        $request = Request::create('/api/upload/initiate', 'POST');
        $request->server->set('REMOTE_ADDR', '10.0.0.1');
        $request->headers->set('User-Agent', 'TestClient/1.0');

        $this->logger->expects(self::once())
            ->method('info')
            ->with('upload_api_request', self::callback(function (array $ctx) {
                return $ctx['ip'] === '10.0.0.1'
                    && $ctx['userAgent'] === 'TestClient/1.0'
                    && $ctx['method'] === 'POST'
                    && $ctx['path'] === '/api/upload/initiate'
                    && $ctx['operation'] === 'initiate'
                    && $ctx['status'] === 201;
            }));

        $this->subscriber->onKernelResponse($this->makeEvent($request, new Response(null, 201)));
    }

    /**
     * @dataProvider operationProvider
     */
    public function testDerivesOperationFromPath(string $method, string $path, string $expectedOperation): void
    {
        $this->logger->expects(self::once())
            ->method('info')
            ->with('upload_api_request', self::callback(fn (array $ctx) => $ctx['operation'] === $expectedOperation));

        $this->subscriber->onKernelResponse($this->makeEvent(
            Request::create($path, $method),
            new Response(),
        ));
    }

    public static function operationProvider(): array
    {
        return [
            ['POST',   '/api/upload/initiate',       'initiate'],
            ['POST',   '/api/upload/chunk',           'chunk'],
            ['POST',   '/api/upload/finalize',        'finalize'],
            ['GET',    '/api/upload/status/abc-123',  'status'],
            ['POST',   '/api/upload/cancel/abc-123',  'cancel'],
            ['DELETE', '/api/upload/abc-123',         'delete'],
        ];
    }

    public function testSkipsNonUploadPaths(): void
    {
        $this->logger->expects(self::never())->method('info');

        $this->subscriber->onKernelResponse($this->makeEvent(
            Request::create('/api/other'),
            new Response(),
        ));
    }

    public function testSkipsSubRequests(): void
    {
        $this->logger->expects(self::never())->method('info');

        $kernel = $this->createMock(HttpKernelInterface::class);
        $event = new ResponseEvent(
            $kernel,
            Request::create('/api/upload/initiate', 'POST'),
            HttpKernelInterface::SUB_REQUEST,
            new Response(),
        );

        $this->subscriber->onKernelResponse($event);
    }

    public function testSubscribesToKernelResponseEvent(): void
    {
        self::assertArrayHasKey(KernelEvents::RESPONSE, AuditLogSubscriber::getSubscribedEvents());
    }

    private function makeEvent(Request $request, Response $response): ResponseEvent
    {
        return new ResponseEvent(
            $this->createMock(HttpKernelInterface::class),
            $request,
            HttpKernelInterface::MAIN_REQUEST,
            $response,
        );
    }
}
