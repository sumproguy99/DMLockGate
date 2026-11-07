import type { CurrentUser } from './auth'
import { api } from './client'

/** Where an invitation stands, from the administrator's side and the invited person's. */
export type InvitationStatus = 'pending' | 'training' | 'device' | 'completed' | 'expired' | 'cancelled'

/** An invitation as administrators see it. Never carries the link or the registration code. */
export type Invitation = {
  id: string
  email: string
  name: string | null
  roles: string[]
  message: string | null
  status: InvitationStatus
  invited_by: string | null
  user: { id: number; name: string } | null
  expires_at: string
  sent_at: string | null
  send_count: number
  last_send_error: string | null
  accepted_at: string | null
  lessons_completed: number
  lessons_total: number
  quiz_attempts: number
  training_completed_at: string | null
  device_registered_at: string | null
  cancelled_at: string | null
  created_at: string
}

export type NewInvitation = { email: string; name: string | null; roles: string[]; message: string | null }

export type SentInvitation = {
  invitation: Invitation
  /** Shown once: the registration code the invitation holds. */
  registration_code?: string
  email_sent: boolean
  email_error: string | null
}

export async function listInvitations(signal?: AbortSignal): Promise<Invitation[]> {
  return (await api<{ data: Invitation[] }>('/invitations', { signal })).data
}

export async function sendInvitation(input: NewInvitation): Promise<SentInvitation> {
  return (await api<{ data: SentInvitation }>('/invitations', { method: 'POST', body: input })).data
}

export async function resendInvitation(id: string): Promise<SentInvitation> {
  return (await api<{ data: SentInvitation }>(`/invitations/${id}/resend`, { method: 'POST' })).data
}

export async function cancelInvitation(id: string): Promise<Invitation> {
  return (await api<{ data: Invitation }>(`/invitations/${id}/cancel`, { method: 'POST' })).data
}

/** The invitation as the invited person sees it, through the link. */
export type InvitationView = {
  status: InvitationStatus
  email: string
  name: string | null
  invited_by: string | null
  message: string | null
  roles: string[]
  expires_at: string
  account_created: boolean
  lessons: string[]
  lessons_completed: string[]
  training_completed: boolean
  quiz_questions: number
  /** The account will work on this one device only. */
  device_bound: boolean
}

export type QuizQuestion = { id: string; question: string; choices: { id: string; text: string }[] }

export type QuizResult = { passed: boolean; results: { id: string; correct: boolean; hint: string | null }[] }

const acceptPath = (token: string) => `/invitations/accept/${encodeURIComponent(token)}`

export async function getInvitation(token: string, signal?: AbortSignal): Promise<InvitationView> {
  return (await api<{ data: InvitationView }>(acceptPath(token), { signal, quiet401: true })).data
}

export async function createInvitedAccount(
  token: string,
  input: { name: string; username: string | null; password: string; password_confirmation: string },
): Promise<InvitationView> {
  return (await api<{ data: InvitationView }>(`${acceptPath(token)}/account`, { method: 'POST', body: input })).data
}

export async function completeLesson(token: string, lesson: string): Promise<InvitationView> {
  return (await api<{ data: InvitationView }>(`${acceptPath(token)}/lessons/${lesson}`, { method: 'POST' })).data
}

export async function getQuiz(token: string, signal?: AbortSignal): Promise<QuizQuestion[]> {
  return (await api<{ data: { questions: QuizQuestion[] } }>(`${acceptPath(token)}/quiz`, { signal })).data.questions
}

export async function answerQuiz(token: string, answers: Record<string, string>): Promise<QuizResult> {
  return (await api<{ data: QuizResult }>(`${acceptPath(token)}/quiz`, { method: 'POST', body: { answers } })).data
}

/** Registers this browser as the person's device and signs them in. */
export async function registerInvitedDevice(token: string, password: string): Promise<CurrentUser> {
  return (await api<{ data: { status: 'authenticated'; user: CurrentUser } }>(`${acceptPath(token)}/device`, { method: 'POST', body: { password } })).data.user
}
