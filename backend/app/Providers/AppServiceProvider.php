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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

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
        RateLimiter::for('lock-commands', fn (Request $request): Limit => Limit::perMinute(10)->by((string) ($request->user()?->id ?? $request->ip())));

        foreach (PermissionKey::cases() as $permission) {
            Gate::define(
                $permission->value,
                fn (User $user): bool => $this->app->make(PermissionResolver::class)->allows($user, $permission),
            );
        }
    }
}
