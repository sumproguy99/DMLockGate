import type { ReactNode } from 'react'
import type { Interaction } from './interactions'
import type { PipMood } from './Pip'
import {
  BellScene,
  HelpScene,
  LocationScene,
  LostPhoneScene,
  MockDoorCard,
  OnePhoneScene,
  PhoneToDoorScene,
  SecretsScene,
  StrangerScene,
} from './illustrations'

/**
 * The LockGuard training, written so a 10-year-old can follow it. The lesson keys match the
 * server's TrainingCatalog::LESSONS, which records each finished lesson; the quiz questions and
 * their answers live on the server.
 */
export type Slide = {
  id: string
  title: string
  mood: PipMood
  /** What Pip says, one short paragraph each. */
  pip: string[]
  picture?: ReactNode
  interaction: Interaction
  /** Pip's reaction once the task is done. */
  cheer: string
  thought: string
  joke: string
}

export type Lesson = { key: string; title: string; summary: string; slides: Slide[] }

export const lessons: Lesson[] = [
  {
    key: 'welcome',
    title: 'Meet LockGuard',
    summary: 'What LockGuard does, and how a tap on your phone becomes a locked door.',
    slides: [
      {
        id: 'hello',
        title: 'Hi! I am Pip.',
        mood: 'wave',
        pip: [
          "I'm Pip, a paperclip. I've spent my whole life holding papers together. Today I'm holding your training together!",
          'LockGuard is an app on your phone. It can lock and unlock the doors you are allowed to use, without a key.',
          "Each lesson has something to tap, sort or try. You can't break anything. Promise.",
        ],
        picture: <PhoneToDoorScene />,
        interaction: {
          kind: 'reveal',
          prompt: 'Tap the button to see the big secret of how LockGuard works.',
          button: 'Show me the secret',
          revealed: (
            <>
              <strong>The secret:</strong> your phone never touches the lock. It asks LockGuard, LockGuard checks you are allowed, then LockGuard
              asks the lock. The lock tells LockGuard what really happened, and LockGuard tells you.
            </>
          ),
        },
        cheer: 'Ta-da! Now you know more than most doors do.',
        thought: 'A lock is only as smart as the person using it. Good news: you are about to be very smart.',
        joke: 'Why did the door go to school? It wanted to get a little more open-minded. (LockGuard keeps it closed-minded, on purpose.)',
      },
      {
        id: 'steps',
        title: 'From tap to door',
        mood: 'think',
        pip: [
          'Every time you lock or unlock, the same four things happen, always in the same order.',
          'LockGuard never guesses. If the lock has not answered yet, LockGuard says so instead of pretending.',
        ],
        interaction: {
          kind: 'order',
          prompt: 'Put the four steps in the right order. Tap the first step, then the next, and so on.',
          steps: [
            'You tap Lock or Unlock in the app',
            'LockGuard checks that you are allowed',
            'LockGuard asks the lock to move',
            'The lock reports back, and the app shows it',
          ],
        },
        cheer: "That's the whole trick. Tap, check, ask, report!",
        thought: 'The app only says "Locked" after the lock itself says so. Being honest is part of being safe.',
        joke: 'I asked the lock for a joke. It said "Knock knock." I said "Who\'s there?" It said "Not you. You\'re not on the list."',
      },
      {
        id: 'map',
        title: 'Finding your way around',
        mood: 'point',
        pip: [
          'The app has four buttons along the bottom of the screen: Home, Activity, Devices and More.',
          'Home shows your doors. Activity shows what happened recently. Devices shows the locks. More has your account, your location timeline and Help.',
        ],
        interaction: {
          kind: 'tap',
          prompt: 'You want to lock the front door. Which button at the bottom do you tap first?',
          options: [
            { label: 'Home', correct: true, feedback: 'Yes! Home shows every door you can use, with big Lock and Unlock buttons.' },
            { label: 'Activity', feedback: 'Activity tells you what already happened. To lock a door, go Home.' },
            { label: 'More', feedback: 'More has settings and help. The doors live on Home.' },
            { label: 'Shake the phone', feedback: 'Ha! Shaking does nothing (except maybe make you dizzy). Try Home.' },
          ],
        },
        cheer: 'Home sweet Home. That is where your doors live.',
        thought: 'When you feel lost in any app, look at the buttons along the bottom. They are like signs in a hallway.',
        joke: "Why don't doors ever get lost? They always know the way out.",
      },
    ],
  },
  {
    key: 'your-device',
    title: 'One phone, one you',
    summary: 'Your account works on your one registered phone. Keep your secrets secret, and know what to do if your phone goes missing.',
    slides: [
      {
        id: 'one-phone',
        title: 'Your phone is your key',
        mood: 'happy',
        pip: [
          'At the end of this training you will register this phone. After that, your LockGuard account works on this phone and nowhere else.',
          "That means even if someone learns your password, they still can't use it on their phone. Sneaky people: zero. You: one.",
          'Getting a new phone? Ask your administrator for a new registration code. The old phone stops working when the new one is registered.',
        ],
        picture: <OnePhoneScene />,
        interaction: {
          kind: 'tap',
          prompt: 'Your cousin found out your password and tries to sign in on their own phone. What happens?',
          options: [
            { label: 'LockGuard says no: it is not your registered phone', correct: true, feedback: 'Right! Your password alone is not enough. It also needs your phone.' },
            { label: 'They can open every door', feedback: 'Nope! Without your registered phone, the password is not enough.' },
            { label: 'The door sings a song', feedback: 'That would be fun, but no. LockGuard just refuses, because it is not your phone.' },
          ],
        },
        cheer: 'Exactly. Password plus your phone. Both, or nothing.',
        thought: 'Two locks are better than one. Your password is one lock; your phone is the second.',
        joke: 'My phone and I are in a very serious relationship. LockGuard made it official.',
      },
      {
        id: 'secrets',
        title: 'Secrets stay secret',
        mood: 'think',
        pip: [
          'Some things are just for you, like your password, your registration code and the link in your invitation email.',
          'Other things are fine to share, like the name of a door or the fact that you use LockGuard.',
          'If a friend needs to get in, they ask the administrator for their own access. They never borrow yours.',
        ],
        picture: <SecretsScene />,
        interaction: {
          kind: 'sort',
          prompt: 'Sort each thing: keep it secret, or OK to share?',
          bins: ['Keep secret', 'OK to share'],
          items: [
            { label: 'Your LockGuard password', bin: 0, why: 'Your password is just for you. Never text it, say it or write it by the door.' },
            { label: 'Your registration code', bin: 0, why: 'The code registers a phone to your account, so it stays secret too.' },
            { label: 'The link in your invitation email', bin: 0, why: 'The link is made just for you. Never forward it.' },
            { label: 'The name of your door, like "Front Door"', bin: 1, why: 'Door names are not secret. Knowing it does not open anything.' },
            { label: 'That you use LockGuard', bin: 1, why: 'Totally fine to share. Using LockGuard is nothing to hide.' },
          ],
        },
        cheer: 'You sorted like a pro. A secret-keeping, door-guarding pro.',
        thought: 'If someone asks for your password, ask yourself: why do they need MY key instead of their own?',
        joke: 'Passwords are like toothbrushes: pick a good one, never share it, and get a new one if somebody else used it. Ew.',
      },
      {
        id: 'lost',
        title: 'The uh-oh plan',
        mood: 'oops',
        pip: [
          'Phones get lost. Under the couch, in the car, at the park. It happens to everyone.',
          'If you cannot find your phone, tell your administrator right away. They can switch that phone off in LockGuard so nobody else can use it.',
          'Found it again later? No problem: ask your administrator for a new registration code and register it again.',
        ],
        picture: <LostPhoneScene />,
        interaction: {
          kind: 'order',
          prompt: 'Your phone is missing! Put the uh-oh plan in order.',
          steps: ['Look in the usual places (couch, bag, car)', 'Still missing? Tell your administrator right away', 'They switch the lost phone off in LockGuard', 'Get a new registration code for your next phone'],
        },
        cheer: 'Phew! With a plan like that, a lost phone is just a small bump.',
        thought: 'The fastest fix is the best fix. A lost phone switched off in five minutes is safer than one switched off tomorrow.',
        joke: 'I lost my phone once. I called it, and it was on silent. Rude.',
      },
    ],
  },
  {
    key: 'door-card',
    title: 'Reading the door card',
    summary: 'Locked, Unlocked or Unknown, plus battery and connection: what each door card tells you.',
    slides: [
      {
        id: 'states',
        title: 'Locked, Unlocked, Unknown',
        mood: 'point',
        pip: [
          'Every door has a card on Home. The big word tells you what the lock last said: Locked (green), Unlocked (yellow) or Unknown (gray).',
          'Unknown means the lock has not said anything lately. LockGuard is being honest: it does not know. So the safe thing is to check the door yourself.',
        ],
        picture: (
          <div className="grid w-full max-w-sm gap-2">
            <MockDoorCard name="Front Door" state="locked" />
          </div>
        ),
        interaction: {
          kind: 'cards',
          prompt: 'Which door should you go and check with your own eyes?',
          options: [
            { name: 'Front Door', state: 'locked', feedback: 'The lock reported Locked a moment ago, so this one is fine.' },
            { name: 'Back Door', state: 'unknown', correct: true, feedback: 'Yes! Unknown means LockGuard is not sure, so a quick look is the smart move.' },
            { name: 'Garage', state: 'unlocked', reported: '1 minute ago', feedback: 'This one says Unlocked, and the lock just reported it, so it is not a mystery. (Lock it if you are leaving!)' },
          ],
        },
        cheer: 'Detective skills: unlocked. (The good kind of unlocked.)',
        thought: '"Unknown" is not scary. It is LockGuard being honest. Honest apps keep you safer than confident guessers.',
        joke: "A door that says Unknown is like a cat in a box: locked and unlocked at the same time, until you go look.",
      },
      {
        id: 'battery',
        title: 'Batteries and Wi-Fi',
        mood: 'think',
        pip: [
          'Under the big word, each card shows the battery and whether the lock is Online.',
          'Smart locks run on batteries. When a battery gets low (20% or less), tell whoever looks after the locks.',
          'Offline means the lock cannot talk to LockGuard right now. Its last state might be old, and buttons may not reach it.',
        ],
        interaction: {
          kind: 'cards',
          prompt: 'Which lock needs new batteries soon?',
          options: [
            { name: 'Front Door', state: 'locked', battery: 92, feedback: '92% is nice and full. Not this one.' },
            { name: 'Side Gate', state: 'locked', battery: 12, correct: true, feedback: 'Yes! 12% is low. Let whoever looks after the locks know.' },
            { name: 'Back Door', state: 'locked', battery: 64, feedback: '64% is plenty for now.' },
          ],
        },
        cheer: 'Nice spotting! You just saved a lock from a very sleepy afternoon.',
        thought: 'A lock with a dead battery cannot hear the app. Low battery today means a quick fix instead of a big problem tomorrow.',
        joke: 'Locks eat batteries, not snacks. I offered one a cookie once. It just stared at me.',
      },
      {
        id: 'offline',
        title: 'When a lock goes quiet',
        mood: 'oops',
        pip: [
          'Sometimes a lock goes Offline, or the top of the app says the Eufy connection is having trouble.',
          'When that happens, the buttons might not reach the door. Use your keypad or key at the door if you have one, and tell your administrator.',
        ],
        interaction: {
          kind: 'cards',
          prompt: 'Which lock probably will not hear the app right now?',
          options: [
            { name: 'Front Door', state: 'locked', online: true, feedback: 'This one is Online and listening.' },
            { name: 'Back Door', state: 'unknown', online: false, correct: true, feedback: 'Right! Offline means it cannot hear LockGuard right now.' },
          ],
        },
        cheer: 'You can read a door card better than most grown-ups. Seriously.',
        thought: 'Technology is great, until the Wi-Fi sneezes. Always have a plan B, like the keypad.',
        joke: 'Why did the lock go offline? It needed some me-time. Locks have feelings too. Well, no. But still.',
      },
    ],
  },
  {
    key: 'lock-unlock',
    title: 'Locking and unlocking',
    summary: 'Practice on a pretend door: lock it, unlock it, and know what to do when the outcome is unknown or a request is denied.',
    slides: [
      {
        id: 'practice-lock',
        title: 'Practice: lock a door',
        mood: 'point',
        pip: [
          'Here is a pretend phone with a pretend door. Nothing real moves, so go wild. (Well, tap once. That is enough.)',
          'Watch the card. First it says "Locking…" while the message travels. It only says "Locked" when the lock answers.',
        ],
        interaction: { kind: 'practice', action: 'lock' },
        cheer: 'You locked your first door! Well, a practice one. Still counts in my book.',
        thought: '"Locking…" is like a letter in the mail. It is on its way, but it has not arrived yet.',
        joke: 'What did the lock say to the app? "I\'ve got this. Give me a second."',
      },
      {
        id: 'practice-unlock',
        title: 'Practice: unlock a door',
        mood: 'think',
        pip: [
          'Unlocking is a bigger deal than locking. An unlocked door lets people in.',
          'So the real app asks "Are you sure?" first. Sometimes it also asks for your password again, to be sure it is really you.',
          'Try it on the practice door. Read the question before you answer it.',
        ],
        interaction: { kind: 'practice', action: 'unlock' },
        cheer: 'Unlocked, safely, on purpose. That is exactly how it is done.',
        thought: 'Locking by accident is harmless. Unlocking by accident is not. That is why only Unlock asks twice.',
        joke: 'Why does Unlock ask "Are you sure?" Because the door has trust issues. Healthy ones.',
      },
      {
        id: 'unknown-outcome',
        title: 'When nobody knows',
        mood: 'oops',
        pip: [
          'Sometimes LockGuard sends the message, but the lock never answers. The app then says "Outcome unknown".',
          'The door might have moved, or not. LockGuard will never press the button again by itself, and you should not panic-tap either.',
        ],
        interaction: {
          kind: 'tap',
          prompt: 'The app says "Outcome unknown". What is the best thing to do?',
          options: [
            { label: 'Check the door, or wait a minute for the lock to report, then try once more if needed', correct: true, feedback: 'Perfect. Calm, careful, and one try at a time.' },
            { label: 'Tap the button 20 times super fast', feedback: 'Tapping lots can confuse things. Check first, then try once.' },
            { label: 'Assume it worked and walk away', feedback: 'Risky! It might not have worked. Check the door or wait for a report.' },
          ],
        },
        cheer: 'Cool as a cucumber. A cucumber with excellent door habits.',
        thought: 'When you are not sure, look. Your eyes are the best lock sensor ever invented.',
        joke: "I tried to tell the lock a secret, but it didn't respond. It was keeping it under lock and key.",
      },
      {
        id: 'denied',
        title: 'When the answer is no',
        mood: 'happy',
        pip: [
          'Sometimes LockGuard says your request was denied. That is not a bug: it means your access does not allow it right now.',
          'For example, some people may only use a door at certain hours. If you think you should be allowed, ask your administrator.',
        ],
        interaction: {
          kind: 'tap',
          prompt: 'LockGuard says "Request denied". Who can help you?',
          options: [
            { label: 'My LockGuard administrator', correct: true, feedback: 'Yes! They set up who can use which doors, and when.' },
            { label: 'The pizza delivery person', feedback: 'Great for pizza, not for door access. Ask your administrator.' },
            { label: 'Nobody, ever', feedback: 'There is always someone: your LockGuard administrator.' },
          ],
        },
        cheer: 'A "no" with a plan is just a "not yet".',
        thought: 'Rules about doors are there to keep everyone safe, including you.',
        joke: 'The door said no. I said "please". It said "Access denied, but thank you for your manners."',
      },
    ],
  },
  {
    key: 'location',
    title: 'Your location',
    summary: 'When LockGuard notes where your phone is, where you can see it, and how long it is kept.',
    slides: [
      {
        id: 'when',
        title: 'When LockGuard notes where you are',
        mood: 'think',
        pip: [
          'LockGuard writes down where your phone is at two moments only: when you lock or unlock with the app, and when an administrator asks while LockGuard is open on your phone.',
          'It does not follow you around all day, and it does not track you while the app is closed.',
          'Records are deleted automatically after a while (usually 30 days).',
        ],
        picture: <LocationScene />,
        interaction: {
          kind: 'multi',
          prompt: 'When does LockGuard note where your phone is? Pick every right answer.',
          options: [
            { label: 'When I lock or unlock with the app', correct: true },
            { label: 'When an administrator asks while LockGuard is open on my phone', correct: true },
            { label: 'Every second, even while I am asleep and the app is closed', correct: false },
            { label: 'Whenever I eat a sandwich', correct: false },
          ],
          hint: 'Not quite. There are exactly two moments, and both happen while LockGuard is open.',
        },
        cheer: 'Two moments, both while the app is open. You nailed it.',
        thought: 'Knowing what an app does with your information is a superpower. Most people never check. You just did.',
        joke: "My location? On your screen. Always. I'm a paperclip, I have nowhere else to be.",
      },
      {
        id: 'timeline',
        title: 'Your own timeline',
        mood: 'point',
        pip: [
          'You can always see every time your location was shared. In the app, open More, then Location and proximity, then Timeline.',
          'Each entry says when it happened, why (like "Unlock Front Door"), which device sent it, and has a map link.',
        ],
        interaction: {
          kind: 'tap',
          prompt: 'Where do you see every time your location was shared?',
          options: [
            { label: 'More, then Location and proximity, then Timeline', correct: true, feedback: 'Yes! Your own diary of every time your phone shared its location.' },
            { label: 'Nowhere, it is top secret', feedback: 'Not secret from you! It is in More, Location and proximity, Timeline.' },
            { label: 'On the back of the door', feedback: 'Doors are bad at keeping diaries. Look in More, Location and proximity, Timeline.' },
          ],
        },
        cheer: 'Timeline found. You are officially the boss of your own information.',
        thought: 'Fair rules are rules everyone can see. That is why your timeline is always open to you.',
        joke: 'My timeline is very boring. Monday: on a desk. Tuesday: on a desk. Wednesday: briefly in a drawer. Scandal!',
      },
      {
        id: 'allow',
        title: 'The location question',
        mood: 'happy',
        pip: [
          'The first time LockGuard needs your location, your phone asks if that is OK.',
          'Allow it, and LockGuard can note where you are when you lock or unlock. Block it, and locking and unlocking still work. You can change your mind later in your browser settings.',
        ],
        interaction: { kind: 'browser' },
        cheer: 'Either answer is OK. What matters is that YOU decide.',
        thought: 'Apps should ask, not assume. When an app asks you something, take a second to read the question.',
        joke: 'Why did the map break up with the compass? It felt like it was always being pointed in one direction.',
      },
    ],
  },
  {
    key: 'safety',
    title: 'Door safety',
    summary: 'Strangers at the door, leaving the house, and the bell that tells you something important.',
    slides: [
      {
        id: 'stranger',
        title: 'Someone you do not know',
        mood: 'oops',
        pip: [
          'A locked door only keeps people out if we do not open it for them.',
          'If someone you do not know asks you to let them in, or tries to walk in right behind you, do not let them in. They should contact the person they are visiting, or the administrator.',
          'Being polite is great. Being polite AND safe is even better: "Sorry, I can\'t let you in. Please call the person you are visiting."',
        ],
        picture: <StrangerScene />,
        interaction: {
          kind: 'tap',
          prompt: 'A stranger by the door says "I forgot my key, can you let me in?" What do you do?',
          options: [
            { label: 'Politely say no, and suggest they call the person they are visiting or the administrator', correct: true, feedback: 'Exactly right. Kind, calm and safe.' },
            { label: 'Unlock the door, they look friendly', feedback: 'Friendly faces can still be strangers. Politely say no.' },
            { label: 'Give them my phone to unlock it themselves', feedback: 'Never hand over your phone. Your phone is your key!' },
          ],
        },
        cheer: 'Door hero! The building thanks you.',
        thought: 'A door is a promise to everyone inside. Keeping it closed to strangers keeps that promise.',
        joke: 'Why did the stranger bring a ladder? They heard the security was on another level.',
      },
      {
        id: 'leaving',
        title: 'Leaving the right way',
        mood: 'point',
        pip: [
          'When you leave, lock the door and wait a moment for the card to say "Locked".',
          'If it says "Outcome unknown" or stays on "Locking…", check the door before you go.',
        ],
        interaction: {
          kind: 'order',
          prompt: 'Put leaving the house in the right order.',
          steps: ['Close the door behind you', 'Tap Lock in the app', 'Wait for the card to say "Locked"', 'Off you go, safe and sound'],
        },
        cheer: 'Smooth exit! Door locked, you confirmed it, adventure begins.',
        thought: 'Leaving is only finished when the lock agrees. Five seconds of waiting can save a whole day of worrying.',
        joke: 'I always double-check the door. Then I triple-check. Then the door asks me to please go away.',
      },
      {
        id: 'bell',
        title: 'The bell',
        mood: 'happy',
        pip: [
          'The bell at the top of the app shows notifications: things LockGuard thinks you should know, like a lock running low on battery or a door being jammed.',
          'A red dot means something new. Tap the bell to read it.',
        ],
        picture: <BellScene />,
        interaction: {
          kind: 'tap',
          prompt: 'The bell has a red dot. What does it mean?',
          options: [
            { label: 'LockGuard has something new to tell me', correct: true, feedback: 'Yes! Tap the bell to read it.' },
            { label: 'Someone is ringing my doorbell', feedback: 'Close! But this bell is in the app. It means a new notification.' },
            { label: 'It is time for lunch', feedback: 'Always a good guess, but no. It means a new notification.' },
          ],
        },
        cheer: 'Ding ding! Correct answer.',
        thought: 'Notifications are only useful if you read them. One quick look can catch a problem early.',
        joke: "Why is the bell so popular? It has a great ring to it.",
      },
    ],
  },
  {
    key: 'help',
    title: 'Getting help',
    summary: 'Where the Help pages are, and who to ask.',
    slides: [
      {
        id: 'help-page',
        title: 'Help is one tap away',
        mood: 'point',
        pip: [
          'The app has its own Help pages. Tap More at the bottom, then Help and troubleshooting.',
          'They explain things like "Device unavailable", "Outcome unknown", a denied request, and being signed out.',
        ],
        picture: <HelpScene />,
        interaction: {
          kind: 'tap',
          prompt: 'The lock shows "Device unavailable". Where can you find out what to do?',
          options: [
            { label: 'More, then Help and troubleshooting', correct: true, feedback: 'Yes! The Help pages explain it step by step.' },
            { label: 'Kick the door', feedback: 'Ouch! Please do not. Open More, then Help and troubleshooting.' },
            { label: 'Turn the phone upside down', feedback: 'The help stays right side up. Try More, then Help.' },
          ],
        },
        cheer: 'Help found! You are now officially un-stuck-able.',
        thought: 'Asking for help is not giving up. It is the fastest way to win.',
        joke: 'What did the lifeguard say to the confused lock? "Don\'t worry, I\'ve got you covered. And un-covered. Depends on the door."',
      },
      {
        id: 'admin',
        title: 'Your people',
        mood: 'cheer',
        pip: [
          'Your LockGuard administrator is the person who invited you. They can give or change access, switch off a lost phone and send new registration codes.',
          'That is all the lessons! Next comes a short quiz with 5 questions. Answer every one right and you can register your phone. You have got this!',
        ],
        interaction: {
          kind: 'tap',
          prompt: 'Your new phone arrives and you want LockGuard on it. What do you need?',
          options: [
            { label: 'A new registration code from my administrator', correct: true, feedback: 'Exactly! New phone, new code, and the old phone stops working.' },
            { label: 'Nothing, it just works', feedback: 'Remember "one phone, one you"? A new phone needs a new code.' },
            { label: 'A magic spell', feedback: 'Spells are not supported yet. Ask your administrator for a new code.' },
          ],
        },
        cheer: 'You finished every lesson! I am so proud I could bend.',
        thought: 'The best security system in the world is a person who knows what they are doing. That is you now.',
        joke: 'Why did the paperclip get a medal? For holding it together under pressure. (That was me. I am the paperclip.)',
      },
    ],
  },
]
