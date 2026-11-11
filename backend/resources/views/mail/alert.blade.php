<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $alertTitle }}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f6;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1b2430;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6;padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #d5dde6;">
                    <tr>
                        <td style="padding:28px 28px 24px 28px;font-size:16px;line-height:1.55;">
                            <p style="margin:0;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#4a6275;">DM LockGuard alert</p>
                            <p style="margin:12px 0 0 0;"><span style="display:inline-block;padding:2px 10px;border-radius:999px;border:1px solid {{ $severityColor }};color:{{ $severityColor }};font-size:13px;font-weight:600;">{{ $severityLabel }}</span></p>
                            <h1 style="margin:8px 0 12px 0;font-size:22px;line-height:1.3;">{{ $alertTitle }}</h1>
                            <p style="margin:0 0 8px 0;">Hi {{ $name }},</p>
                            <p style="margin:0 0 16px 0;">{{ $description }}</p>
                            <p style="margin:0 0 20px 0;"><a href="{{ $link }}" style="display:inline-block;background:#1f5f8b;color:#ffffff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px;">Open LockGuard</a></p>
                            <p style="margin:0;font-size:13px;color:#4a6275;">
                                @if ($mandatory)
                                    You receive security alerts because you handle incidents in LockGuard; serious ones are always emailed to you.
                                @else
                                    You receive this because of your notification preferences.
                                @endif
                                <a href="{{ $preferencesUrl }}" style="color:#1f5f8b;">Change what LockGuard emails you</a>.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
