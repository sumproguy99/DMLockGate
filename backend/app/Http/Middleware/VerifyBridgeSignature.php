<?php

namespace App\Http\Middleware;

use App\Services\Locks\Integration\BridgeSignature;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Admits only requests signed by the Eufy bridge with the shared secret. Refuses stale timestamps
 * and replayed signatures. Fails closed when no secret is configured.
 */
class VerifyBridgeSignature
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = (string) config('lockguard.locks.eufy_bridge.secret');
        $timestamp = (string) $request->header(BridgeSignature::TIMESTAMP_HEADER);
        $signature = (string) $request->header(BridgeSignature::SIGNATURE_HEADER);

        $reason = match (true) {
            mb_strlen($secret) < 32 => 'not_configured',
            ! ctype_digit($timestamp) || preg_match('/^[0-9a-f]{64}$/', $signature) !== 1 => 'missing_signature',
            abs(now()->getTimestamp() - (int) $timestamp) > BridgeSignature::MAX_SKEW_SECONDS => 'stale_timestamp',
            ! hash_equals(BridgeSignature::sign($secret, $timestamp, $request->method(), '/'.ltrim($request->path(), '/'), $request->getContent()), $signature) => 'bad_signature',
            ! Cache::add('bridge-signature:'.$signature, true, BridgeSignature::MAX_SKEW_SECONDS * 2) => 'replayed',
            default => null,
        };

        if ($reason !== null) {
            Log::warning('Refused an unsigned or invalid bridge request.', ['reason' => $reason, 'ip' => $request->ip()]);

            return response()->json(['error' => ['code' => 'unauthorized', 'message' => 'Invalid bridge signature.']], 401);
        }

        return $next($request);
    }
}
