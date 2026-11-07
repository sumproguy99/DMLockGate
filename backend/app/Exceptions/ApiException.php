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

    public static function deviceRegistrationRequired(): self
    {
        return new self(403, 'device_registration_required', 'This device is not registered for your account. Enter the registration code your administrator gave you, or sign in on your registered device.');
    }

    public static function deviceBelongsToOther(): self
    {
        return new self(403, 'device_belongs_to_other', 'This device is registered to another person. Sign in on your own registered device.');
    }

    public static function addressNotAllowed(): self
    {
        return new self(403, 'address_not_allowed', 'This account can only be used from its approved network address.');
    }

    public static function deviceRevoked(): self
    {
        return new self(403, 'device_revoked', 'This device has been removed from your account. Sign in from another device, or ask an administrator.');
    }

    public static function trainingRequired(): self
    {
        return new self(403, 'training_required', 'Finish the LockGuard training from your invitation link before you sign in. Open the invitation email and tap Accept Invitation to carry on where you left off.');
    }

    public static function invitationNotFound(): self
    {
        return new self(404, 'invitation_not_found', 'This invitation link is not valid. Check that you opened the whole link, or ask your administrator for a new invitation.');
    }

    public static function invitationClosed(string $status): self
    {
        return match ($status) {
            'completed' => new self(410, 'invitation_completed', 'This invitation has already been used. Sign in with your email and password.'),
            'cancelled' => new self(410, 'invitation_cancelled', 'This invitation was cancelled. Ask your administrator for a new one.'),
            'expired' => new self(410, 'invitation_expired', 'This invitation has expired. Ask your administrator to send it again.'),
            default => new self(409, 'invitation_wrong_step', 'This step is not available yet. Go back and finish the earlier steps first.'),
        };
    }
}
