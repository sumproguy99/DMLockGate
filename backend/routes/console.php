<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('lockguard:expire-commands')->everyMinute()->withoutOverlapping();
Schedule::command('lockguard:sync-locks')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('lockguard:check-alerts')->everyMinute()->withoutOverlapping();
Schedule::command('lockguard:prune-locations')->daily()->withoutOverlapping();
