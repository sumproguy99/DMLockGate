<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Sent after a password reset, so a reset the person did not make is noticed and reported.
 */
class PasswordChangedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        public readonly string $signInUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Your DM LockGuard password was changed');
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.password-changed',
            text: 'mail.password-changed-text',
        );
    }
}
