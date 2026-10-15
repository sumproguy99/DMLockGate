<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * An expected API failure with a stable machine-readable code and a user-facing message.
 * Rendered as {"error": {"code": ..., "message": ...}} by bootstrap/app.php.
 */
class ApiException extends RuntimeException
{
    /**
     * @param  array<string, mixed>  $details
     */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $details = [],
    ) {
        parent::__construct($message);
    }

    public static function accountInactive(): self
    {
        return new self(403, 'account_inactive', 'This account is suspended, revoked or expired. Contact an administrator.');
    }
}
