<?php

namespace App\Mail;

use Carbon\CarbonInterface;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The invitation email: who invited the person, what they will do, and the Accept Invitation
 * button. It never contains the registration code; the link carries the person to it.
 */
class InvitationMail extends Mailable
{
    use Queueable, SerializesModels;

    /**
     * @param  list<string>  $roleLabels
     */
    public function __construct(
        public readonly ?string $inviteeName,
        public readonly string $inviterName,
        public readonly string $acceptUrl,
        public readonly CarbonInterface $expiresAt,
        public readonly array $roleLabels,
        public readonly ?string $personalMessage,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->inviterName.' invited you to DM LockGuard');
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.invitation',
            text: 'mail.invitation-text',
        );
    }
}
