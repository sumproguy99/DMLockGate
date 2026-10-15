<?php

namespace App\Http\Controllers\Api\V1\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;

class CurrentUserController extends Controller
{
    /**
     * The signed-in user with roles and effective permissions.
     */
    public function __invoke(Request $request): UserResource
    {
        return new UserResource($request->user()->load('roles'));
    }
}
