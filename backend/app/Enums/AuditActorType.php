<?php

namespace App\Enums;

enum AuditActorType: string
{
    case User = 'user';
    case System = 'system';
    case Integration = 'integration';
}
