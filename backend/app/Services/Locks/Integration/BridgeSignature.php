<?php

namespace App\Services\Locks\Integration;

/**
 * HMAC request signing shared with the Eufy bridge (integrations/eufy/src/bridge/auth.mjs).
 *
 * Signed string: "<unix seconds>\n<METHOD>\n<path>\n<sha256 hex of body>".
 */
final class BridgeSignature
{
    public const TIMESTAMP_HEADER = 'X-LockGuard-Timestamp';

    public const SIGNATURE_HEADER = 'X-LockGuard-Signature';

    public const MAX_SKEW_SECONDS = 60;

    public static function sign(string $secret, string $timestamp, string $method, string $path, string $body): string
    {
        return hash_hmac('sha256', implode("\n", [$timestamp, strtoupper($method), $path, hash('sha256', $body)]), $secret);
    }

    /**
     * @return array<string, string>
     */
    public static function headers(string $secret, string $method, string $path, string $body): array
    {
        $timestamp = (string) now()->getTimestamp();

        return [
            self::TIMESTAMP_HEADER => $timestamp,
            self::SIGNATURE_HEADER => self::sign($secret, $timestamp, $method, $path, $body),
        ];
    }
}
