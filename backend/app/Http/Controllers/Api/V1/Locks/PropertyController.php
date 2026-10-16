<?php

namespace App\Http\Controllers\Api\V1\Locks;

use App\Enums\AuditOutcome;
use App\Http\Controllers\Controller;
use App\Models\Lock;
use App\Models\Property;
use App\Services\Audit\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

class PropertyController extends Controller
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function index(): JsonResponse
    {
        Gate::authorize('manage', Lock::class);

        return response()->json(['data' => Property::query()->withCount('locks')->orderBy('name')->get(['id', 'name', 'address', 'timezone'])]);
    }

    public function store(Request $request): JsonResponse
    {
        Gate::authorize('manage', Lock::class);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'address' => ['nullable', 'string', 'max:255'],
            'timezone' => ['sometimes', 'timezone:all'],
        ]);

        $property = DB::transaction(function () use ($validated, $request): Property {
            $property = Property::query()->create($validated);
            $this->audit->record('property.created', AuditOutcome::Success, actor: $request->user(), metadata: ['property_id' => $property->id, 'name' => $property->name]);

            return $property;
        });

        return response()->json(['data' => $property->only(['id', 'name', 'address', 'timezone'])], 201);
    }
}
