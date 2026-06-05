<?php

namespace App\EventSubscriber;

use App\Service\UploadApiLimiter;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;

class RateLimitSubscriber implements EventSubscriberInterface
{
    public function __construct(private readonly UploadApiLimiter $limiter)
    {
    }

    public function onKernelRequest(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }

        $request = $event->getRequest();

        if ($request->getPathInfo() !== '/api/upload/initiate') {
            return;
        }

        $limiter = $this->limiter->create($request->getClientIp() ?? 'unknown');
        $limit = $limiter->consume();

        if ($limit->isAccepted()) {
            return;
        }

        $retryAfter = max(0, $limit->getRetryAfter()->getTimestamp() - time());

        $response = new JsonResponse([
            'error' => [
                'code' => 'rate_limit_exceeded',
                'message' => 'Too many requests. Maximum 10 upload sessions per minute.',
            ],
        ], 429);

        $response->headers->set('X-RateLimit-Limit', '10');
        $response->headers->set('X-RateLimit-Remaining', (string) max(0, $limit->getRemainingTokens()));
        $response->headers->set('Retry-After', (string) $retryAfter);

        $event->setResponse($response);
    }

    public static function getSubscribedEvents(): array
    {
        return [KernelEvents::REQUEST => 'onKernelRequest'];
    }
}
