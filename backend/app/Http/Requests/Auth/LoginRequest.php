<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;

class LoginRequest extends FormRequest
{
    public const MAX_ATTEMPTS = 5;

    public const DECAY_SECONDS = 300;

    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:1024'],
        ];
    }

    /**
     * Rate-limit key: per account and per client address, so one attacker cannot lock out every user.
     */
    public function throttleKey(): string
    {
        return 'login:'.Str::transliterate(Str::lower($this->string('email')->toString())).'|'.$this->ip();
    }
}
