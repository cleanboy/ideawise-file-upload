<?php

namespace App\Service;

use Symfony\Component\RateLimiter\LimiterInterface;
use Symfony\Component\RateLimiter\RateLimiterFactory;

class UploadApiLimiter
{
    public function __construct(private readonly RateLimiterFactory $factory)
    {
    }

    public function create(string $key): LimiterInterface
    {
        return $this->factory->create($key);
    }
}
