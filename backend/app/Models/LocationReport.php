<?php

namespace App\Models;

use Database\Factories\LocationReportFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A location reported by a user's browser. Client-reported and therefore not tamper-proof; it is
 * shown on the map, never used to authorize anything. Deleted after the retention period.
 */
class LocationReport extends Model
{
    /** @use HasFactory<LocationReportFactory> */
    use HasFactory;

    public const PURPOSE_LOCK_REQUEST = 'lock_request';

    public const PURPOSE_LOCATION_REQUEST = 'location_request';

    public const SOURCE_BROWSER = 'browser';

    protected $guarded = [];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'latitude' => 'float',
            'longitude' => 'float',
            'accuracy_meters' => 'float',
            'captured_at' => 'datetime',
            'received_at' => 'datetime',
        ];
    }

    /**
     * @return BelongsTo<User, $this>
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The browser or phone the location came from, when known.
     *
     * @return BelongsTo<UserDevice, $this>
     */
    public function device(): BelongsTo
    {
        return $this->belongsTo(UserDevice::class, 'user_device_id');
    }

    /**
     * @return BelongsTo<AccessRequest, $this>
     */
    public function accessRequest(): BelongsTo
    {
        return $this->belongsTo(AccessRequest::class);
    }

    /**
     * @return BelongsTo<LocationRequest, $this>
     */
    public function locationRequest(): BelongsTo
    {
        return $this->belongsTo(LocationRequest::class);
    }
}
