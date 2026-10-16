<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('lockguard:expire-commands')->everyMinute()->withoutOverlapping();
Schedule::command('lockguard:sync-locks')->everyFiveMinutes()->withoutOverlapping();
