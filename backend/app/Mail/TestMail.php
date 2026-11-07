<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * The test email sent from the Email settings page.
 */
class TestMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public readonly string $senderName) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'DM LockGuard test email');
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.test',
            text: 'mail.test-text',
        );
    }
}
