<?php

namespace App\Providers;

use App\Enums\PermissionKey;
use App\Models\User;
use App\Services\Authorization\PermissionResolver;
use App\Services\Locks\Integration\EufyBridgeDriver;
use App\Services\Locks\Integration\FakeLockDriver;
use App\Services\Locks\Integration\LockDriver;
use App\Services\Locks\Integration\UnconfiguredLockDriver;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->scoped(PermissionResolver::class);

        $this->app->singleton(LockDriver::class, fn (): LockDriver => match (config('lockguard.locks.driver')) {
            'fake' => new FakeLockDriver,
            'eufy_bridge' => EufyBridgeDriver::fromConfig((array) config('lockguard.locks.eufy_bridge')),
            default => new UnconfiguredLockDriver,
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // The visitor's real address behind the proxies on this machine (the Vite dev server),
        // from X-Forwarded-For only. A header from anyone else is ignored, so it cannot be faked.
        TrustProxies::at((array) config('lockguard.trusted_proxies'));
        TrustProxies::withHeaders(Request::HEADER_X_FORWARDED_FOR);

        RateLimiter::for('lock-commands', fn (Request $request): Limit => Limit::perMinute(10)->by((string) ($request->user()?->id ?? $request->ip())));
        // Asking for reset links: a few a minute from one address, and a few an hour for one email,
        // so nobody can flood a mailbox or use LockGuard to spam someone.
        RateLimiter::for('password-reset-request', fn (Request $request): array => [
            Limit::perMinute(5)->by('ip:'.$request->ip()),
            Limit::perHour(5)->by('email:'.Str::lower(trim((string) $request->input('email')))),
        ]);

        foreach (PermissionKey::cases() as $permission) {
            Gate::define(
                $permission->value,
                fn (User $user): bool => $this->app->make(PermissionResolver::class)->allows($user, $permission),
            );
        }
    }
}
