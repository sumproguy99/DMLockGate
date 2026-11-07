<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Services\Invitations\InvitationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;

/**
 * The invited person's side, signed out: the link's token is the credential until the device is
 * registered, which also needs the account's password and signs them in.
 */
class AcceptInvitationController extends Controller
{
    public function __construct(private readonly InvitationService $invitations) {}

    public function show(string $token): JsonResponse
    {
        return response()->json(['data' => $this->invitations->describeForInvitee($this->invitations->findByToken($token))]);
    }

    public function account(Request $request, string $token): JsonResponse
    {
        $invitation = $this->invitations->findByToken($token);
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'username' => ['nullable', 'string', 'min:3', 'max:64', 'alpha_dash:ascii', 'unique:users,username'],
            'password' => ['required', 'string', 'max:1024', 'confirmed', Password::min(12)->letters()->numbers()],
        ]);

        $this->invitations->createAccount($invitation, $validated);

        return response()->json(['data' => $this->invitations->describeForInvitee($invitation->refresh())], 201);
    }

    public function lesson(string $token, string $lesson): JsonResponse
    {
        $invitation = $this->invitations->findByToken($token);
        $this->invitations->completeLesson($invitation, $lesson);

        return response()->json(['data' => $this->invitations->describeForInvitee($invitation->refresh())]);
    }

    public function quiz(string $token): JsonResponse
    {
        return response()->json(['data' => ['questions' => $this->invitations->quiz($this->invitations->findByToken($token))]]);
    }

    public function answer(Request $request, string $token): JsonResponse
    {
        $invitation = $this->invitations->findByToken($token);
        $validated = $request->validate([
            'answers' => ['required', 'array', 'max:20'],
            'answers.*' => ['string', 'max:8'],
        ]);

        return response()->json(['data' => $this->invitations->answerQuiz($invitation, $validated['answers'])]);
    }

    public function device(Request $request, string $token): JsonResponse
    {
        $invitation = $this->invitations->findByToken($token);
        $validated = $request->validate(['password' => ['required', 'string', 'max:1024']]);

        return $this->invitations->registerDevice($request, $invitation, $validated['password']);
    }
}
