<?php

namespace App\Http\Controllers\Api\V1\System;

use App\Enums\AuditOutcome;
use App\Enums\PermissionKey;
use App\Http\Controllers\Controller;
use App\Mail\TestMail;
use App\Services\Audit\AuditLogger;
use App\Services\Authorization\UserManagementGuard;
use App\Services\Mail\MailSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Throwable;

/**
 * Email settings (admin.notifications): the SMTP server LockGuard sends invitations through. The
 * password is never sent back; saving and test emails are audited.
 */
class EmailSettingsController extends Controller
{
    public function __construct(
        private readonly MailSettings $settings,
        private readonly UserManagementGuard $guard,
        private readonly AuditLogger $audit,
    ) {}

    public function show(Request $request): JsonResponse
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminNotifications, 'settings.email_viewed');

        return response()->json(['data' => $this->settings->forDisplay()]);
    }

    public function update(Request $request): JsonResponse
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminNotifications, 'settings.email_updated');

        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
            'host' => ['required_if:enabled,true', 'nullable', 'string', 'max:255', 'regex:/^[A-Za-z0-9.\-:\[\]]+$/'],
            'port' => ['required', 'integer', 'min:1', 'max:65535'],
            'security' => ['required', Rule::in(MailSettings::SECURITY)],
            'username' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:1024'],
            'from_address' => ['required', 'string', 'email', 'max:255'],
            'from_name' => ['required', 'string', 'max:120'],
        ], [
            'host.regex' => 'Enter a server name such as smtp.gmail.com, without http:// or spaces.',
            'host.required_if' => 'Enter the mail server to send through.',
        ]);

        $changed = $this->settings->save([
            ...$validated,
            'host' => (string) ($validated['host'] ?? ''),
            'password' => $request->exists('password') ? ($validated['password'] ?? '') : null,
        ], $request->user());
        $this->audit->record('settings.email_updated', AuditOutcome::Success, actor: $request->user(), metadata: ['changed' => $changed]);

        return response()->json(['data' => $this->settings->forDisplay()]);
    }

    public function test(Request $request): JsonResponse
    {
        $this->guard->requirePermission($request->user(), PermissionKey::AdminNotifications, 'settings.email_tested');
        $validated = $request->validate(['to' => ['required', 'string', 'email', 'max:255']]);

        try {
            $this->settings->apply();
            Mail::to($validated['to'])->send(new TestMail($request->user()->name));
        } catch (Throwable $exception) {
            Log::warning('Test email could not be sent.', ['error' => $exception->getMessage()]);
            $this->audit->record('settings.email_tested', AuditOutcome::Failure, actor: $request->user(), reason: Str::limit($exception->getMessage(), 250), metadata: ['to' => $validated['to']]);

            return response()->json(['data' => ['sent' => false, 'error' => Str::limit($exception->getMessage(), 480), 'mailer' => (string) config('mail.default')]]);
        }

        $this->audit->record('settings.email_tested', AuditOutcome::Success, actor: $request->user(), metadata: ['to' => $validated['to']]);

        return response()->json(['data' => ['sent' => true, 'error' => null, 'mailer' => (string) config('mail.default')]]);
    }
}
