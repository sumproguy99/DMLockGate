<?php

namespace App\Models;

use App\Enums\PermissionKey;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A row mirroring one {@see PermissionKey} case. Rows are synchronized from the enum by
 * PermissionCatalogSeeder and are never created from user input.
 */
#[Fillable(['key', 'group', 'name', 'description', 'is_sensitive'])]
class Permission extends Model
{
    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'key' => PermissionKey::class,
            'is_sensitive' => 'boolean',
        ];
    }

    /**
     * @return BelongsToMany<Role, $this>
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_permissions')->withTimestamps();
    }
}
