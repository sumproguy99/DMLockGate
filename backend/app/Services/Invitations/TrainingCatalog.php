<?php

namespace App\Services\Invitations;

use Illuminate\Support\Arr;

/**
 * The LockGuard training an invited person completes before registering their device: the lesson
 * keys (the lessons themselves live in the web app) and the quiz question bank, with the right
 * answers kept here on the server.
 */
class TrainingCatalog
{
    /**
     * Every lesson, in order. Each must be completed before the quiz opens.
     */
    public const LESSONS = [
        'welcome',
        'your-device',
        'door-card',
        'lock-unlock',
        'location',
        'safety',
        'help',
    ];

    /**
     * The quiz bank. Each question: text, choices by id, the right choice and a hint that points
     * back to the lesson without giving the answer away.
     *
     * @var array<string, array{lesson: string, question: string, choices: array<string, string>, answer: string, hint: string}>
     */
    private const QUESTIONS = [
        'one-device' => [
            'lesson' => 'your-device',
            'question' => 'How many phones or browsers can your LockGuard account be used on?',
            'choices' => [
                'a' => 'As many as I like',
                'b' => 'Just one: the device I register',
                'c' => 'Any phone in my house',
                'd' => 'Only my best friend\'s phone',
            ],
            'answer' => 'b',
            'hint' => 'Think back to "One phone, one you".',
        ],
        'share-password' => [
            'lesson' => 'your-device',
            'question' => 'A friend asks for your LockGuard password so they can open the door. What do you do?',
            'choices' => [
                'a' => 'Text it to them, they are a good friend',
                'b' => 'Write it on a sticky note by the door',
                'c' => 'Keep it secret and tell them to ask the administrator for their own access',
                'd' => 'Say it out loud really fast',
            ],
            'answer' => 'c',
            'hint' => 'Passwords are like toothbrushes. Remember why?',
        ],
        'lost-phone' => [
            'lesson' => 'your-device',
            'question' => 'You lost your phone. What is the first thing to do?',
            'choices' => [
                'a' => 'Wait a week and see if it turns up',
                'b' => 'Tell your administrator right away so they can switch that phone off',
                'c' => 'Buy a new phone and say nothing',
                'd' => 'Nothing, phones cannot open doors',
            ],
            'answer' => 'b',
            'hint' => 'The "uh-oh" plan from "One phone, one you".',
        ],
        'unknown-state' => [
            'lesson' => 'door-card',
            'question' => 'A door card says "Unknown" or "Stale". What does that mean?',
            'choices' => [
                'a' => 'The door is definitely locked',
                'b' => 'The door is definitely open',
                'c' => 'The lock has not reported recently, so check the door yourself',
                'd' => 'The door went on vacation',
            ],
            'answer' => 'c',
            'hint' => 'LockGuard only tells you what the lock reports. Look at "Reading the door card".',
        ],
        'locking-wait' => [
            'lesson' => 'lock-unlock',
            'question' => 'You tapped Lock and the card says "Locking…". When is the door actually locked?',
            'choices' => [
                'a' => 'Right away, the moment I tap',
                'b' => 'When the card changes to "Locked", because the lock itself reported it',
                'c' => 'After I say "abracadabra"',
                'd' => 'Never',
            ],
            'answer' => 'b',
            'hint' => 'The card only says "Locked" when someone you can trust says so. Who?',
        ],
        'outcome-unknown' => [
            'lesson' => 'lock-unlock',
            'question' => 'A command says "Outcome unknown". What should you do?',
            'choices' => [
                'a' => 'Tap the button 20 more times very quickly',
                'b' => 'Check the door, or wait a minute for the lock to report, before trying once more',
                'c' => 'Throw the phone',
                'd' => 'Assume it worked and walk away',
            ],
            'answer' => 'b',
            'hint' => 'LockGuard never repeats a command by itself, and neither should a nervous thumb.',
        ],
        'unlock-confirm' => [
            'lesson' => 'lock-unlock',
            'question' => 'Why does Unlock ask "Are you sure?" (and sometimes your password) before it starts?',
            'choices' => [
                'a' => 'Because opening a door is a big deal, so LockGuard makes sure it is really you and you really mean it',
                'b' => 'Because the app is nosy',
                'c' => 'To waste time',
                'd' => 'It never does',
            ],
            'answer' => 'a',
            'hint' => 'Locking is safe to do by accident. Is unlocking?',
        ],
        'location-when' => [
            'lesson' => 'location',
            'question' => 'When does LockGuard record where your phone is?',
            'choices' => [
                'a' => 'Every second of every day, even when the app is closed',
                'b' => 'When you lock or unlock with the app, and when an administrator asks while LockGuard is open',
                'c' => 'Only on your birthday',
                'd' => 'Never',
            ],
            'answer' => 'b',
            'hint' => 'Two moments, both while LockGuard is open. "Your location" lesson.',
        ],
        'location-see' => [
            'lesson' => 'location',
            'question' => 'Where can you see every time your location was shared?',
            'choices' => [
                'a' => 'Nowhere, it is a secret',
                'b' => 'In More, then Location and proximity, then Timeline',
                'c' => 'On the fridge',
                'd' => 'Only the administrator can ever see it',
            ],
            'answer' => 'b',
            'hint' => 'There is a timeline, like a diary of your phone\'s trips.',
        ],
        'tailgating' => [
            'lesson' => 'safety',
            'question' => 'Someone you do not know is waiting by the door and asks you to let them in. What do you do?',
            'choices' => [
                'a' => 'Unlock it, they look friendly',
                'b' => 'Hold the door wide open for them',
                'c' => 'Do not let them in; they should contact the person they are visiting or the administrator',
                'd' => 'Give them your phone',
            ],
            'answer' => 'c',
            'hint' => 'A locked door only works if we do not open it for strangers. "Door safety".',
        ],
        'leaving' => [
            'lesson' => 'safety',
            'question' => 'You are leaving and tapped Lock. What is the safest way to finish?',
            'choices' => [
                'a' => 'Run away before it finishes',
                'b' => 'Wait for the card to say "Locked", or check the door yourself',
                'c' => 'Unlock it again just to be sure',
                'd' => 'Leave the door wide open so the lock can do its job',
            ],
            'answer' => 'b',
            'hint' => 'Leaving is only finished when the lock agrees.',
        ],
        'denied' => [
            'lesson' => 'help',
            'question' => 'LockGuard says your request was denied. Who can help?',
            'choices' => [
                'a' => 'Your LockGuard administrator',
                'b' => 'The mail carrier',
                'c' => 'Nobody, ever',
                'd' => 'The door itself',
            ],
            'answer' => 'a',
            'hint' => 'Denied means your access does not allow it right now. Who sets up access?',
        ],
        'help-page' => [
            'lesson' => 'help',
            'question' => 'The lock shows "Device unavailable". Where can you find out what to do?',
            'choices' => [
                'a' => 'In More, then Help and troubleshooting',
                'b' => 'By shaking the phone',
                'c' => 'By kicking the door',
                'd' => 'There is no help anywhere',
            ],
            'answer' => 'a',
            'hint' => 'The app has its own help pages. Where did Pip point?',
        ],
    ];

    /**
     * @return list<string>
     */
    public function questionIds(): array
    {
        return array_keys(self::QUESTIONS);
    }

    /**
     * A fresh set of quiz questions: one from each of several lessons first, so the quiz covers
     * as much of the training as it can, then random others.
     *
     * @return list<string>
     */
    public function pickQuestions(int $count): array
    {
        $byLesson = collect(self::QUESTIONS)->map(fn (array $question, string $id): array => [...$question, 'id' => $id])->groupBy('lesson')->shuffle();
        $picked = $byLesson->map(fn ($questions) => $questions->random()['id'])->take($count)->values();
        $rest = collect($this->questionIds())->diff($picked)->shuffle()->take($count - $picked->count());

        return $picked->concat($rest)->shuffle()->values()->all();
    }

    /**
     * The questions for the person, without their answers.
     *
     * @param  list<string>  $ids
     * @return list<array{id: string, question: string, choices: list<array{id: string, text: string}>}>
     */
    public function present(array $ids): array
    {
        return array_values(array_map(fn (string $id): array => [
            'id' => $id,
            'question' => self::QUESTIONS[$id]['question'],
            'choices' => array_values(array_map(
                fn (string $choice, string $text): array => ['id' => $choice, 'text' => $text],
                array_keys(self::QUESTIONS[$id]['choices']),
                self::QUESTIONS[$id]['choices'],
            )),
        ], array_filter($ids, fn (string $id): bool => isset(self::QUESTIONS[$id]))));
    }

    /**
     * Mark the answers: each question right or wrong, with a hint for the wrong ones.
     *
     * @param  list<string>  $ids
     * @param  array<string, mixed>  $answers
     * @return list<array{id: string, correct: bool, hint: string|null}>
     */
    public function mark(array $ids, array $answers): array
    {
        return array_values(array_map(function (string $id) use ($answers): array {
            $correct = Arr::get($answers, $id) === self::QUESTIONS[$id]['answer'];

            return ['id' => $id, 'correct' => $correct, 'hint' => $correct ? null : self::QUESTIONS[$id]['hint']];
        }, array_filter($ids, fn (string $id): bool => isset(self::QUESTIONS[$id]))));
    }
}
