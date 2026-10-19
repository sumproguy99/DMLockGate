<?php

namespace App\Services\Locks\Integration;

use App\Enums\LockAction;
use App\Enums\ReportedLockState;
use App\Models\Lock;
use Carbon\CarbonImmutable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Talks to the Node.js Eufy bridge over its signed internal API (docs/EUFY_BRIDGE.md).
 *
 * Classifying a failed send is the safety-critical part. Only failures that prove the command never
 * left LockGuard, or that the bridge explicitly reports as not delivered ("rejected"), become
 * {@see IntegrationUnavailable}. Everything else, including timeouts, becomes
 * {@see IntegrationOutcomeUnknown}, because the command may have reached the lock.
 */
class EufyBridgeDriver implements LockDriver
{
    /** cURL could not resolve the host (6) or connect (7): nothing was sent. */
    private const NOT_SENT_CURL_ERRORS = [6, 7];

    public function __construct(
        private readonly string $baseUrl,
        private readonly string $secret,
        private readonly int $connectTimeoutSeconds = 3,
        private readonly int $sendTimeoutSeconds = 30,
        private readonly int $readTimeoutSeconds = 15,
    ) {}

    /**
     * @param  array<string, mixed>  $config  The lockguard.locks.eufy_bridge block.
     */
    public static function fromConfig(array $config): LockDriver
    {
        if (blank($config['url'] ?? null) || mb_strlen((string) ($config['secret'] ?? '')) < 32) {
            return new UnconfiguredLockDriver;
        }

        return new self(
            rtrim($config['url'], '/'),
            $config['secret'],
            (int) ($config['connect_timeout_seconds'] ?? 3),
            (int) ($config['send_timeout_seconds'] ?? 30),
            (int) ($config['read_timeout_seconds'] ?? 15),
        );
    }

    public function send(Lock $lock, LockAction $action, string $commandId): void
    {
        $path = '/v1/locks/'.rawurlencode((string) $lock->external_id).'/commands';
        $body = json_encode(['action' => $action->value, 'command_id' => $commandId], JSON_THROW_ON_ERROR);

        try {
            $response = $this->request('POST', $path, $body, $this->sendTimeoutSeconds);
        } catch (ConnectionException $exception) {
            if ($this->provesNotSent($exception)) {
                throw new IntegrationUnavailable('The Eufy bridge is not reachable.', previous: $exception);
            }

            throw new IntegrationOutcomeUnknown('No reply from the Eufy bridge; the command may have been sent.', previous: $exception);
        }

        $result = $response->json('result');
        if ($response->successful() && $result === 'acknowledged') {
            return;
        }

        $error = (string) ($response->json('error') ?? 'http_'.$response->status());
        if ($result === 'rejected') {
            $detail = $response->json('detail');
            $reason = is_string($detail) && $detail !== '' ? ': '.$detail : '.';

            throw new IntegrationUnavailable("The Eufy bridge did not send the command ({$error}){$reason}");
        }

        throw new IntegrationOutcomeUnknown("The Eufy bridge could not confirm delivery ({$error}).");
    }

    public function readState(Lock $lock): ReportedState
    {
        $data = $this->getJson('/v1/locks/'.rawurlencode((string) $lock->external_id).'/state');

        return new ReportedState(
            ReportedLockState::tryFrom((string) ($data['state'] ?? '')) ?? ReportedLockState::Unknown,
            CarbonImmutable::now(),
            is_int($data['battery_level'] ?? null) ? $data['battery_level'] : null,
        );
    }

    /**
     * The locks the bridge's Eufy account can see.
     *
     * @return list<array{external_id: string, name: ?string, model: ?string, firmware_version: ?string}>
     *
     * @throws IntegrationUnavailable
     */
    public function listLocks(): array
    {
        return array_values($this->getJson('/v1/locks'));
    }

    /**
     * The bridge's own view of its Eufy session. Answered from memory by the bridge, so the timeout is
     * short: a dashboard waits on it.
     *
     * @return array<string, mixed>
     *
     * @throws IntegrationUnavailable
     */
    public function health(): array
    {
        return $this->getJson('/v1/health', unwrap: false, timeoutSeconds: min(5, $this->readTimeoutSeconds));
    }

    /**
     * @return array<mixed>
     *
     * @throws IntegrationUnavailable
     */
    private function getJson(string $path, bool $unwrap = true, ?int $timeoutSeconds = null): array
    {
        try {
            $response = $this->request('GET', $path, '', $timeoutSeconds ?? $this->readTimeoutSeconds);
        } catch (ConnectionException $exception) {
            throw new IntegrationUnavailable('The Eufy bridge is not reachable.', previous: $exception);
        }

        if (! $response->successful()) {
            throw new IntegrationUnavailable('The Eufy bridge returned '.$response->status().' ('.($response->json('error') ?? 'error').').');
        }

        $data = $unwrap ? $response->json('data') : $response->json();
        if (! is_array($data)) {
            throw new IntegrationUnavailable('The Eufy bridge returned an unexpected reply.');
        }

        return $data;
    }

    /**
     * @throws ConnectionException
     */
    private function request(string $method, string $path, string $body, int $timeoutSeconds): Response
    {
        $request = Http::baseUrl($this->baseUrl)
            ->acceptJson()
            ->connectTimeout($this->connectTimeoutSeconds)
            ->timeout($timeoutSeconds)
            ->withHeaders(BridgeSignature::headers($this->secret, $method, $path, $body));

        return $method === 'POST'
            ? $request->withBody($body, 'application/json')->post($path)
            : $request->get($path);
    }

    /**
     * Guzzle reports cURL failures as "cURL error <errno>: ...". A message without an errno proves nothing.
     */
    private function provesNotSent(ConnectionException $exception): bool
    {
        return preg_match('/cURL error (\d+):/', $exception->getMessage(), $match) === 1
            && in_array((int) $match[1], self::NOT_SENT_CURL_ERRORS, true);
    }
}
