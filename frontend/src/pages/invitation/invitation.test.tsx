import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Invitation, InvitationView, QuizQuestion } from '../../api/invitations'
import type { EmailSettings } from '../../api/settings'
import { AppRoutes } from '../../App'
import { AuthProvider } from '../../auth/AuthProvider'
import { lessons } from '../../components/onboarding/lessons'
import { ToastProvider } from '../../components/ui/ToastProvider'
import { apiError, clearCookies, json, makeUser, mockFetch, signedIn } from '../../test/api'
import { expectNoAxeViolations } from '../../test/axe'

const TOKEN = 'a'.repeat(64)
const BASE = `/api/v1/invitations/accept/${TOKEN}`
const LESSON_KEYS = lessons.map((lesson) => lesson.key)

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>
    </ToastProvider>,
  )
}

function view(overrides: Partial<InvitationView> = {}): InvitationView {
  return {
    status: 'pending',
    email: 'riley@example.test',
    name: 'Riley',
    invited_by: 'Dana Admin',
    message: 'Welcome to the building!',
    roles: ['Resident'],
    expires_at: '2026-11-14T12:00:00.000Z',
    account_created: false,
    lessons: LESSON_KEYS,
    lessons_completed: [],
    training_completed: false,
    quiz_questions: 2,
    device_bound: true,
    ...overrides,
  }
}

const questions: QuizQuestion[] = [
  { id: 'one-device', question: 'How many phones can your account be used on?', choices: [{ id: 'a', text: 'As many as I like' }, { id: 'b', text: 'Just one' }] },
  { id: 'denied', question: 'Who can help when a request is denied?', choices: [{ id: 'a', text: 'My administrator' }, { id: 'b', text: 'The door' }] },
]

const signedOut = { 'GET /api/v1/auth/me': () => apiError(401, 'unauthenticated', 'Sign in to continue.') }

beforeEach(() => {
  clearCookies()
  document.cookie = 'XSRF-TOKEN=test-token; path=/'
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Completes the "Your turn" task of a help-lesson tap slide by choosing the right answer. */
async function answerTap(user: ReturnType<typeof userEvent.setup>, label: RegExp) {
  await user.click(screen.getByRole('button', { name: label }))
}

describe('accepting an invitation', () => {
  it('walks from the welcome to a registered phone, with the training and quiz in between', async () => {
    let current = view()
    mockFetch({
      // Signed out until the phone is registered, which signs the person in.
      'GET /api/v1/auth/me': () =>
        current.status === 'completed' ? json(200, { data: makeUser({ name: 'Riley Resident' }) }) : apiError(401, 'unauthenticated', 'Sign in to continue.'),
      [`GET ${BASE}`]: () => json(200, { data: current }),
      [`POST ${BASE}/account`]: ({ body }) => {
        expect(body).toEqual({ name: 'Riley Resident', username: null, password: 'purple-llama-42', password_confirmation: 'purple-llama-42' })
        // Straight to the last lesson, to keep the test short.
        current = view({ status: 'training', account_created: true, lessons_completed: LESSON_KEYS.slice(0, -1) })
        return json(201, { data: current })
      },
      [`POST ${BASE}/lessons/help`]: () => {
        current = { ...current, lessons_completed: LESSON_KEYS }
        return json(200, { data: current })
      },
      [`GET ${BASE}/quiz`]: () => json(200, { data: { questions } }),
      [`POST ${BASE}/quiz`]: ({ body }) => {
        const { answers } = body as { answers: Record<string, string> }
        if (answers.denied !== 'a') {
          return json(200, { data: { passed: false, results: [{ id: 'one-device', correct: true, hint: null }, { id: 'denied', correct: false, hint: 'Who sets up access?' }] } })
        }
        current = { ...current, status: 'device', training_completed: true }
        return json(200, { data: { passed: true, results: [{ id: 'one-device', correct: true, hint: null }, { id: 'denied', correct: true, hint: null }] } })
      },
      [`POST ${BASE}/device`]: ({ body }) => {
        expect(body).toEqual({ password: 'purple-llama-42' })
        current = { ...current, status: 'completed' }
        return json(200, { data: { status: 'authenticated', user: makeUser({ name: 'Riley Resident' }) } })
      },
    })
    const { container } = renderAt(`/invite/${TOKEN}`)
    const user = userEvent.setup()

    // Welcome
    expect(await screen.findByRole('heading', { level: 1, name: 'Hi Riley, welcome!' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Pip the paperclip, waving hello' })).toBeInTheDocument()
    expect(screen.getByText('Dana Admin', { selector: 'strong' })).toBeInTheDocument()
    expect(screen.getByText('"Welcome to the building!"', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Your progress' })).toBeInTheDocument()
    await expectNoAxeViolations(container)
    await user.click(screen.getByRole('button', { name: "Let's go!" }))

    // Account
    expect(await screen.findByRole('heading', { level: 1, name: 'Create your account' })).toBeInTheDocument()
    expect(screen.getByText('riley@example.test')).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/Your name/))
    await user.type(screen.getByLabelText(/Your name/), 'Riley Resident')
    await user.type(screen.getByLabelText(/^Password/), 'purple-llama-42')
    await user.type(screen.getByLabelText(/Type the password again/), 'purple-llama-42')
    await user.click(screen.getByRole('button', { name: 'Create my account' }))

    // The last lesson: two slides, each with a task that unlocks Next.
    expect(await screen.findByText(/Lesson 7 of 7: Getting help/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Help is one tap away' })).toHaveFocus()
    const next = screen.getByRole('button', { name: 'Next' })
    expect(next).toBeDisabled()
    await answerTap(user, /Kick the door/)
    expect(screen.getByText(/Ouch! Please do not/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Pip the paperclip, surprised' })).toBeInTheDocument()
    expect(next).toBeDisabled()
    await answerTap(user, /^More, then Help and troubleshooting/)
    expect(next).toBeEnabled()
    expect(screen.getByRole('complementary', { name: 'Food for thought' })).toHaveTextContent('Asking for help is not giving up')
    expect(screen.getByRole('complementary', { name: "Pip's joke" })).toBeInTheDocument()
    await user.click(next)

    expect(await screen.findByRole('heading', { level: 2, name: 'Your people' })).toBeInTheDocument()
    await answerTap(user, /A new registration code from my administrator/)
    await user.click(screen.getByRole('button', { name: 'Finish the lessons' }))

    // Quiz: a wrong answer gets a hint and a second try.
    expect(await screen.findByRole('heading', { level: 2, name: 'The big quiz' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send my answers' }))
    expect(screen.getByText('Answer every question first. 2 to go!')).toBeInTheDocument()
    const first = screen.getByRole('group', { name: /Question 1 of 2/ })
    await user.click(within(first).getByRole('radio', { name: 'Just one' }))
    const second = screen.getByRole('group', { name: /Question 2 of 2/ })
    await user.click(within(second).getByRole('radio', { name: 'The door' }))
    await user.click(screen.getByRole('button', { name: 'Send my answers' }))
    expect(await screen.findByText('Try again. Hint: Who sets up access?')).toBeInTheDocument()
    expect(within(first).getByRole('radio', { name: 'Just one' })).toBeDisabled()
    await user.click(within(second).getByRole('radio', { name: 'My administrator' }))
    await user.click(screen.getByRole('button', { name: 'Send my answers again' }))

    // Device
    expect(await screen.findByRole('heading', { level: 1, name: 'Register your phone' })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Your password/), 'purple-llama-42')
    await user.click(screen.getByRole('button', { name: 'Register this phone' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'You did it!' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open LockGuard' })).toHaveAttribute('href', '/m')
  })

  it('makes the practice door lock only after the pretend lock answers', async () => {
    const start = view({ status: 'training', account_created: true, lessons_completed: LESSON_KEYS.slice(0, 3) })
    mockFetch({ ...signedOut, [`GET ${BASE}`]: () => json(200, { data: start }) })
    renderAt(`/invite/${TOKEN}`)
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 2, name: 'Practice: lock a door' })).toBeInTheDocument()
    expect(screen.getByText('Practice mode: no real door moves')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Lock Practice Door' }))
    expect(screen.getByText('Locking…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(await screen.findByText('Locked', {}, { timeout: 3000 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
  })

  it('sorts secrets one by one before moving on', async () => {
    const start = view({ status: 'training', account_created: true, lessons_completed: ['welcome'] })
    mockFetch({ ...signedOut, [`GET ${BASE}`]: () => json(200, { data: start }) })
    const { container } = renderAt(`/invite/${TOKEN}`)
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 2, name: 'Your phone is your key' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /LockGuard says no/ }))
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('heading', { level: 2, name: 'Secrets stay secret' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Your LockGuard password: OK to share' }))
    expect(screen.getByText(/Hmm, not that one/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Your LockGuard password: Keep secret' }))
    await user.click(screen.getByRole('button', { name: 'Your registration code: Keep secret' }))
    await user.click(screen.getByRole('button', { name: 'The link in your invitation email: Keep secret' }))
    await user.click(screen.getByRole('button', { name: 'The name of your door, like "Front Door": OK to share' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'That you use LockGuard: OK to share' }))
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
    await expectNoAxeViolations(container)
  })

  it('explains a link that does not work', async () => {
    mockFetch({ ...signedOut, [`GET ${BASE}`]: () => apiError(404, 'invitation_not_found', 'This invitation link is not valid.') })
    renderAt(`/invite/${TOKEN}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'This link does not work' })).toBeInTheDocument()
    expect(screen.getByText('This invitation link is not valid.')).toBeInTheDocument()
  })

  it('says when the invitation expired', async () => {
    mockFetch({ ...signedOut, [`GET ${BASE}`]: () => json(200, { data: view({ status: 'expired' }) }) })
    renderAt(`/invite/${TOKEN}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'This invitation has expired' })).toBeInTheDocument()
  })
})

const admin = makeUser({ name: 'Dana Admin', permissions: ['users.create', 'users.assign_roles', 'users.edit', 'admin.notifications'] })

function invitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'riley@example.test',
    name: 'Riley',
    roles: ['resident'],
    message: null,
    status: 'training',
    invited_by: 'Dana Admin',
    user: { id: 9, name: 'Riley Resident' },
    expires_at: '2026-11-14T12:00:00.000Z',
    sent_at: '2026-11-07T12:00:00.000Z',
    send_count: 1,
    last_send_error: null,
    accepted_at: '2026-11-07T12:10:00.000Z',
    lessons_completed: 3,
    lessons_total: 7,
    quiz_attempts: 0,
    training_completed_at: null,
    device_registered_at: null,
    cancelled_at: null,
    created_at: '2026-11-07T12:00:00.000Z',
    ...overrides,
  }
}

describe('invitations page', () => {
  it('lists where each person is and sends a new invitation, showing the held code once', async () => {
    const list = [invitation()]
    mockFetch({
      ...signedIn(admin),
      'GET /api/v1/invitations': () => json(200, { data: list }),
      'GET /api/v1/roles': () =>
        json(200, {
          data: [
            { key: 'resident', name: 'Resident', description: 'Locks and unlocks assigned doors.', is_system: true, permissions: [] },
            { key: 'temporary_guest', name: 'Temporary Guest', description: null, is_system: true, permissions: [] },
          ],
        }),
      'POST /api/v1/invitations': ({ body }) => {
        expect(body).toEqual({ email: 'sam@example.test', name: 'Sam', message: null, roles: ['resident'] })
        const created = invitation({ id: '22222222-2222-4222-8222-222222222222', email: 'sam@example.test', name: 'Sam', status: 'pending', user: null, accepted_at: null, lessons_completed: 0 })
        list.unshift(created)
        return json(201, { data: { invitation: created, registration_code: 'ABCD-EFGH', email_sent: true, email_error: null } })
      },
    })
    const { container } = renderAt('/invitations')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'Invitations' })).toBeInTheDocument()
    expect(await screen.findByText('3 of 7 lessons done')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Riley Resident' })).toHaveAttribute('href', '/users/9')
    expect(screen.getByRole('link', { name: 'Invitations' })).toHaveAttribute('aria-current', 'page')
    await expectNoAxeViolations(container)

    await user.click(screen.getAllByRole('button', { name: 'Invite someone' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Invite someone' })
    await user.type(within(dialog).getByLabelText(/Email/), 'sam@example.test')
    await user.type(within(dialog).getByLabelText(/^Name/), 'Sam')
    expect(await within(dialog).findByRole('checkbox', { name: /Resident/ })).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }))

    expect(await screen.findByText('Invitation emailed to sam@example.test')).toBeInTheDocument()
    expect(screen.getByText('ABCD-EFGH')).toBeInTheDocument()
    expect(await screen.findByText('Has not created an account yet')).toBeInTheDocument()
  })

  it('warns when the email could not be sent', async () => {
    mockFetch({
      ...signedIn(admin),
      'GET /api/v1/invitations': () => json(200, { data: [] }),
      'GET /api/v1/roles': () => json(200, { data: [] }),
      'POST /api/v1/invitations': () =>
        json(201, {
          data: { invitation: invitation({ status: 'pending', user: null }), registration_code: 'ABCD-EFGH', email_sent: false, email_error: 'The email could not be sent: connection refused.' },
        }),
    })
    renderAt('/invitations')
    const user = userEvent.setup()

    expect(await screen.findByText('No invitations yet')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Invite someone' })[0])
    const dialog = await screen.findByRole('dialog', { name: 'Invite someone' })
    await user.type(within(dialog).getByLabelText(/Email/), 'riley@example.test')
    await user.click(within(dialog).getByRole('button', { name: 'Send invitation' }))

    expect(await screen.findByText(/could not be sent$/)).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Email settings' }).length).toBeGreaterThan(0)
  })
})

describe('email settings page', () => {
  const blank: EmailSettings = {
    configured: false,
    enabled: false,
    host: '',
    port: 587,
    security: 'starttls',
    username: '',
    password_set: false,
    from_address: '',
    from_name: 'DM LockGuard',
    updated_at: null,
    updated_by: null,
    fallback_mailer: 'log',
  }

  it('fills in a provider, saves without echoing the password, and sends a test', async () => {
    let saved: unknown = null
    mockFetch({
      ...signedIn(admin),
      'GET /api/v1/settings/email': () =>
        json(200, { data: saved ? { ...blank, configured: true, enabled: true, host: 'smtp.gmail.com', password_set: true, updated_at: '2026-11-07T12:00:00.000Z', updated_by: 'Dana Admin', from_address: 'door@example.test' } : blank }),
      'PUT /api/v1/settings/email': ({ body }) => {
        saved = body
        return json(200, { data: blank })
      },
      'POST /api/v1/settings/email/test': ({ body }) => {
        expect(body).toEqual({ to: 'alex@example.test' })
        return json(200, { data: { sent: true, error: null, mailer: 'lockguard_smtp' } })
      },
    })
    const { container } = renderAt('/settings/email')
    const user = userEvent.setup()

    expect(await screen.findByRole('heading', { level: 1, name: 'Email settings' })).toBeInTheDocument()
    expect(await screen.findByText('Email is not set up in LockGuard yet')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Gmail' }))
    expect(screen.getByLabelText(/^Server/)).toHaveValue('smtp.gmail.com')
    expect(screen.getByText(/Use a Google app password/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Username/), 'door@example.test')
    await user.type(screen.getByLabelText(/^Password/), 'app-pass')
    await user.type(screen.getByLabelText(/From address/), 'door@example.test')
    await expectNoAxeViolations(container)
    await user.click(screen.getByRole('button', { name: 'Save email settings' }))

    await waitFor(() =>
      expect(saved).toEqual({
        enabled: true,
        host: 'smtp.gmail.com',
        port: 587,
        security: 'starttls',
        username: 'door@example.test',
        password: 'app-pass',
        from_address: 'door@example.test',
        from_name: 'DM LockGuard',
      }),
    )
    expect(await screen.findByText('A password is saved. Leave this empty to keep it.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Password/)).toHaveValue('')

    await user.click(screen.getByRole('button', { name: 'Send test email' }))
    expect(await screen.findByText(/Test email sent to alex@example.test/)).toBeInTheDocument()
  })

  it('is not offered without admin.notifications', async () => {
    mockFetch(signedIn(makeUser({ permissions: ['users.create'] })))
    renderAt('/settings/email')

    expect(await screen.findByRole('heading', { level: 1, name: 'Not available to you' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Email settings' })).not.toBeInTheDocument()
  })
})
