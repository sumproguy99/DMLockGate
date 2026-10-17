<?php

namespace App\Enums;

/**
 * The lifecycle of a lock/unlock request (project spec section 9).
 *
 * RECEIVED → AUTHENTICATING → AUTHORIZED | DENIED
 * AUTHORIZED → QUEUED → SUBMITTED → CONFIRMED_SUCCESS | FAILED | UNKNOWN_RESULT
 * QUEUED → EXPIRED | CANCELLED | ALREADY_IN_STATE | FAILED (never submitted)
 *
 * ALREADY_IN_STATE: a fresh read just before sending showed the requested state, so nothing was
 * sent. A confirmation after sending would prove nothing in that case.
 */
enum AccessRequestStatus: string
{
    case Received = 'received';
    case Authenticating = 'authenticating';
    case Authorized = 'authorized';
    case Denied = 'denied';
    case Queued = 'queued';
    case Submitted = 'submitted';
    case ConfirmedSuccess = 'confirmed_success';
    case Failed = 'failed';
    case UnknownResult = 'unknown_result';
    case AlreadyInState = 'already_in_state';
    case Expired = 'expired';
    case Cancelled = 'cancelled';

    public function isFinal(): bool
    {
        return in_array($this, [
            self::Denied,
            self::ConfirmedSuccess,
            self::Failed,
            self::UnknownResult,
            self::AlreadyInState,
            self::Expired,
            self::Cancelled,
        ], true);
    }

    /**
     * A plain-language description for the person who made the request.
     */
    public function message(): string
    {
        return match ($this) {
            self::Received, self::Authenticating => 'Checking your request.',
            self::Authorized, self::Queued => 'Approved. Sending to the lock.',
            self::Submitted => 'Sent. Waiting for the lock to report its new state.',
            self::ConfirmedSuccess => 'Confirmed by the lock.',
            self::Denied => 'Not allowed.',
            self::Failed => 'The command could not be delivered to the lock.',
            self::UnknownResult => 'The lock did not confirm in time. Check the door before trying again.',
            self::AlreadyInState => 'The lock already reported that state just now. Nothing was sent.',
            self::Expired => 'The request expired before it could be sent. Nothing was sent to the lock.',
            self::Cancelled => 'Cancelled. Nothing was sent to the lock.',
        };
    }
}
