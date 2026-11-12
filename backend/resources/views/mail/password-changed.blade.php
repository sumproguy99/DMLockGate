<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Your DM LockGuard password was changed</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1b2430;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #d5dde6;">
                    <tr>
                        <td style="padding:28px 28px 24px 28px;font-size:16px;line-height:1.55;">
                            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#4a6275;">DM LockGuard</p>
                            <h1 style="margin:8px 0 12px 0;font-size:24px;line-height:1.3;">Your password was changed</h1>
                            <p style="margin:0 0 12px 0;">Hi {{ $name }}, @if ($changedWhileSignedIn)the password for your DM LockGuard account was just changed while signed in, and your other sessions were signed out.@else the password for your DM LockGuard account was just reset using an emailed link, and you were signed out everywhere.@endif</p>
                            <p style="margin:0 0 12px 0;">If that was you, you're all set: <a href="{{ $signInUrl }}" style="color:#1f5f8b;">sign in</a> on your registered phone with your new password.</p>
                            <p style="margin:0;"><strong>If it wasn't you,</strong> tell your LockGuard administrator right away so they can suspend the account and check what happened.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
