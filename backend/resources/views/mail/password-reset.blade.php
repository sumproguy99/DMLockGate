<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Reset your DM LockGuard password</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1b2430;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #d5dde6;">
                    <tr>
                        <td style="padding:28px 28px 8px 28px;">
                            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#4a6275;">DM LockGuard</p>
                            <h1 style="margin:8px 0 0 0;font-size:24px;line-height:1.3;color:#1b2430;">Hi {{ $name }}, let's reset your password</h1>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:8px 28px 0 28px;font-size:16px;line-height:1.55;">
                            <p style="margin:0 0 18px 0;">Someone, hopefully you, asked to reset the password for your DM LockGuard account. Tap the button to choose a new one.</p>
                        </td>
                    </tr>
                    <tr>
                        <td align="center" style="padding:0 28px 18px 28px;">
                            <a href="{{ $resetUrl }}" style="display:inline-block;background:#1f5f8b;color:#ffffff;text-decoration:none;font-weight:700;font-size:17px;padding:14px 28px;border-radius:8px;">
                                Choose a new password
                            </a>
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:0 28px 24px 28px;font-size:14px;line-height:1.5;color:#4a5866;">
                            <p style="margin:0 0 8px 0;">The link works once, for {{ $expiresInMinutes }} minutes. Resetting signs you out everywhere; then sign in on your registered phone as usual.</p>
                            <p style="margin:0 0 8px 0;">If the button does not work, copy this address into your browser:<br>
                                <a href="{{ $resetUrl }}" style="color:#1f5f8b;word-break:break-all;">{{ $resetUrl }}</a></p>
                            <p style="margin:0;">Did not ask for this? Ignore this email; your password stays the same. Never forward it: the link is just for you.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
