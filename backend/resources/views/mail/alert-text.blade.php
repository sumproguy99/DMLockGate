DM LockGuard alert ({{ $severityLabel }})

{{ $alertTitle }}

Hi {{ $name }},

{{ $description }}

Open LockGuard: {{ $link }}

@if ($mandatory)
You receive security alerts because you handle incidents in LockGuard; serious ones are always emailed to you.
@else
You receive this because of your notification preferences.
@endif
Change what LockGuard emails you: {{ $preferencesUrl }}
