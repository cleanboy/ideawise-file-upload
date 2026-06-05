<?php

namespace App\EventSubscriber;

use Psr\Log\LoggerInterface;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

class AuditLogSubscriber implements EventSubscriberInterface
{
    public function __construct(private readonly LoggerInterface $auditLogger)
    {
    }

    public function onKernelResponse(ResponseEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $request = $event->getRequest();

        if (!str_starts_with($request->getPathInfo(), '/api/upload')) {
            return;
        }

        $this->auditLogger->info('upload_api_request', [
            'ip'        => $request->getClientIp(),
            'userAgent' => $request->headers->get('User-Agent'),
            'method'    => $request->getMethod(),
            'path'      => $request->getPathInfo(),
            'operation' => $this->deriveOperation($request->getMethod(), $request->getPathInfo()),
            'status'    => $event->getResponse()->getStatusCode(),
        ]);
    }

    private function deriveOperation(string $method, string $path): string
    {
        return match (true) {
            $method === 'POST'   && $path === '/api/upload/initiate'                     => 'initiate',
            $method === 'POST'   && $path === '/api/upload/chunk'                        => 'chunk',
            $method === 'POST'   && $path === '/api/upload/finalize'                     => 'finalize',
            $method === 'GET'    && str_starts_with($path, '/api/upload/status/')        => 'status',
            $method === 'POST'   && str_starts_with($path, '/api/upload/cancel/')        => 'cancel',
            $method === 'DELETE' && str_starts_with($path, '/api/upload/')               => 'delete',
            default                                                                      => 'unknown',
        };
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::RESPONSE => 'onKernelResponse'];
    }
}
