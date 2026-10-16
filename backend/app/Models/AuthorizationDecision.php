<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuthorizationDecision extends Model
{
    public const ALLOW = 'allow';

    public const DENY = 'deny';

    public $timestamps = false;

    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'checks' => 'array',
            'decided_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<AccessRequest, $this>
     */
    public function accessRequest(): BelongsTo
    {
        return $this->belongsTo(AccessRequest::class);
    }
}
