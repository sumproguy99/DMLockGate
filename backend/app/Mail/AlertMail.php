<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * A security alert, emailed to someone it concerns. The same words as the in-app notification.
 */
class AlertMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $name,
        public readonly string $severity,
        public readonly string $alertTitle,
        public readonly string $description,
        public readonly string $link,
        public readonly bool $mandatory,
        public readonly string $preferencesUrl,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: '['.ucfirst($this->severity).'] '.$this->alertTitle);
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.alert',
            text: 'mail.alert-text',
            with: ['severityLabel' => ucfirst($this->severity), 'severityColor' => match ($this->severity) {
                'critical' => '#a3201c',
                'high' => '#b4480f',
                'medium' => '#8a6100',
                default => '#4a6275',
            }],
        );
    }
}
