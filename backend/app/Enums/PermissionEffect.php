<?php

namespace App\Enums;

enum PermissionEffect: string
{
    case Allow = 'allow';
    case Deny = 'deny';
}
