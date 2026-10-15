<?php

namespace App\Providers;

use App\Enums\PermissionKey;
use App\Models\User;
use App\Services\Authorization\PermissionResolver;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->scoped(PermissionResolver::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        foreach (PermissionKey::cases() as $permission) {
            Gate::define(
                $permission->value,
                fn (User $user): bool => $this->app->make(PermissionResolver::class)->allows($user, $permission),
            );
        }
    }
}
