<?php

namespace App\Enums;

enum LockConnectionStatus: string
{
    case Connected = 'connected';
    case Disconnected = 'disconnected';
    case Degraded = 'degraded';
    case Synchronizing = 'synchronizing';
    case Unknown = 'unknown';
}
