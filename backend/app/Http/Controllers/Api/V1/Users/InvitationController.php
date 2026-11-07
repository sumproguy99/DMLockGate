<?php

namespace App\Http\Controllers\Api\V1\Users;

use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Http\Requests\Users\StoreInvitationRequest;
use App\Http\Resources\InvitationResource;
use App\Models\Invitation;
use App\Services\Authorization\UserManagementGuard;
use App\Services\Invitations\InvitationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Invitations administrators send (users.create). Creating one also creates the registration
 * code it holds; the code is shown once, in the response.
 */
class InvitationController extends Controller
{
    private const RELATIONS = ['inviter:id,name', 'user:id,name', 'registrationCode'];

    public function __construct(
        private readonly InvitationService $invitations,
        private readonly UserManagementGuard $guard,
    ) {}

    public function index(Request $request): AnonymousResourceCollection
    {
        $this->guard->requirePermission($request->user(), PermissionKey::UsersCreate, 'invitation.list');

        return InvitationResource::collection(Invitation::query()->with(self::RELATIONS)->latest('id')->limit(200)->get());
    }

    public function store(StoreInvitationRequest $request): JsonResponse
    {
        $result = $this->invitations->invite($request->user(), $request->validated());

        return response()->json([
            'data' => [
                'invitation' => new InvitationResource($result['invitation']->load(self::RELATIONS)),
                'registration_code' => $result['code'],
                'email_sent' => $result['email']['sent'],
                'email_error' => $result['email']['error'],
            ],
        ], 201);
    }

    public function resend(Request $request, Invitation $invitation): JsonResponse
    {
        $email = $this->invitations->resend($invitation, $request->user());

        return response()->json([
            'data' => [
                'invitation' => new InvitationResource($invitation->refresh()->load(self::RELATIONS)),
                'email_sent' => $email['sent'],
                'email_error' => $email['error'],
            ],
        ]);
    }

    public function cancel(Request $request, Invitation $invitation): InvitationResource
    {
        $this->invitations->cancel($invitation, $request->user());

        return new InvitationResource($invitation->refresh()->load(self::RELATIONS));
    }
}
