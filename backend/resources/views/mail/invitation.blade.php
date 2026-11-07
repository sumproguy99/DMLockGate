<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>You're invited to DM LockGuard</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1b2430;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #d5dde6;">
                    <tr>
                        <td style="padding:28px 28px 8px 28px;">
                            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#4a6275;">DM LockGuard</p>
                            <h1 style="margin:8px 0 0 0;font-size:24px;line-height:1.3;color:#1b2430;">
                                {{ $inviteeName ? 'Hi '.$inviteeName.'!' : 'Hi there!' }} You're invited.
                            </h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:8px 28px 0 28px;font-size:16px;line-height:1.55;">
                            <p style="margin:0 0 14px 0;">
                                <strong>{{ $inviterName }}</strong> invited you to DM LockGuard, the app that locks and unlocks your doors from your phone.
                            </p>
                            @if ($personalMessage)
                                <blockquote style="margin:0 0 14px 0;padding:10px 14px;border-left:4px solid #2f6f9f;background:#f3f7fa;font-style:italic;">
                                    {{ $personalMessage }}
                                </blockquote>
                            @endif
                            <p style="margin:0 0 8px 0;">Pip the paperclip will walk you through three short steps:</p>
                            <ol style="margin:0 0 18px 20px;padding:0;">
                                <li style="margin-bottom:4px;">Create your account.</li>
                                <li style="margin-bottom:4px;">Take the fun, quick training and answer 5 easy questions.</li>
                                <li>Register the phone you will use to open doors.</li>
                            </ol>
                            <p style="margin:0 0 18px 0;">Open this email on the phone you want to use, then tap the button.</p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:0 28px 18px 28px;">
                            <a href="{{ $acceptUrl }}" style="display:inline-block;background:#1f5f8b;color:#ffffff;text-decoration:none;font-weight:700;font-size:17px;padding:14px 28px;border-radius:8px;">
                                Accept Invitation
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 28px 24px 28px;font-size:14px;line-height:1.5;color:#4a5866;">
                            @if ($roleLabels !== [])
                                <p style="margin:0 0 8px 0;">Your access: {{ implode(', ', $roleLabels) }}.</p>
                            @endif
                            <p style="margin:0 0 8px 0;">This invitation works until {{ $expiresAt->timezone(config('app.timezone'))->format('F j, Y g:i A T') }}.</p>
                            <p style="margin:0 0 8px 0;">If the button does not work, copy this address into your browser:<br>
                                <a href="{{ $acceptUrl }}" style="color:#1f5f8b;word-break:break-all;">{{ $acceptUrl }}</a></p>
                            <p style="margin:0;">Not expecting this? You can ignore it; nothing happens unless you accept. Never forward this email: the link is just for you.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
