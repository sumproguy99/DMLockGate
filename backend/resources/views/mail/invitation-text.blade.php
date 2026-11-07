{{ $inviteeName ? 'Hi '.$inviteeName.'!' : 'Hi there!' }} You're invited.

{{ $inviterName }} invited you to DM LockGuard, the app that locks and unlocks your doors from your phone.
@if ($personalMessage)

"{{ $personalMessage }}"
@endif

Pip the paperclip will walk you through three short steps:
1. Create your account.
2. Take the fun, quick training and answer 5 easy questions.
3. Register the phone you will use to open doors.

Open this email on the phone you want to use, then open this link to accept:
{{ $acceptUrl }}

@if ($roleLabels !== [])
Your access: {{ implode(', ', $roleLabels) }}.
@endif
This invitation works until {{ $expiresAt->timezone(config('app.timezone'))->format('F j, Y g:i A T') }}.

Not expecting this? You can ignore it; nothing happens unless you accept. Never forward this email: the link is just for you.
