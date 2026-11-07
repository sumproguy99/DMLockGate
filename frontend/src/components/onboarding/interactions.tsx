import { Check, Lock as LockIcon, LockOpen, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { BrowserLocationPrompt, MockDoorCard, type MockDoorState } from './illustrations'

/**
 * The things a person does to move through the training. Every slide has one, and Next stays off
 * until it is done. Feedback is announced politely, so screen reader users hear it too.
 */
export type Interaction =
  | { kind: 'tap'; prompt: string; options: { label: string; correct?: boolean; feedback: string }[] }
  | {
      kind: 'cards'
      prompt: string
      options: { name: string; state: MockDoorState; battery?: number; online?: boolean; reported?: string; correct?: boolean; feedback: string }[]
    }
  | { kind: 'sort'; prompt: string; bins: [string, string]; items: { label: string; bin: 0 | 1; why: string }[] }
  | { kind: 'order'; prompt: string; steps: string[] }
  | { kind: 'multi'; prompt: string; options: { label: string; correct: boolean }[]; hint: string }
  | { kind: 'reveal'; prompt: string; button: string; revealed: ReactNode }
  | { kind: 'practice'; action: 'lock' | 'unlock' }
  | { kind: 'browser' }

/** How long the pretend lock takes to answer. */
export const PRACTICE_DELAY_MS = 900

type Feedback = { tone: 'good' | 'bad'; text: string } | null

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  return (
    <p aria-live="polite" className={cx('min-h-6 text-support font-medium', feedback?.tone === 'good' ? 'text-success' : 'text-warning')}>
      {feedback && (
        <span className="pip-pop inline-flex items-start gap-1.5" key={feedback.text}>
          {feedback.tone === 'good' ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0" aria-hidden />}
          {feedback.text}
        </span>
      )}
    </p>
  )
}

function Prompt({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="text-body font-semibold">
      {children}
    </p>
  )
}

type InteractionProps = { interaction: Interaction; done: boolean; onDone: () => void; onMiss?: () => void }

export function InteractionView(props: InteractionProps) {
  const { interaction } = props
  switch (interaction.kind) {
    case 'tap':
      return <TapChoice {...props} interaction={interaction} />
    case 'cards':
      return <CardChoice {...props} interaction={interaction} />
    case 'sort':
      return <SortItems {...props} interaction={interaction} />
    case 'order':
      return <OrderSteps {...props} interaction={interaction} />
    case 'multi':
      return <MultiChoice {...props} interaction={interaction} />
    case 'reveal':
      return <Reveal {...props} interaction={interaction} />
    case 'practice':
      return <PracticeDoor {...props} interaction={interaction} />
    case 'browser':
      return <BrowserQuestion {...props} />
  }
}

type Props<K extends Interaction['kind']> = Omit<InteractionProps, 'interaction'> & { interaction: Extract<Interaction, { kind: K }> }

function TapChoice({ interaction, done, onDone, onMiss }: Props<'tap'>) {
  const [picked, setPicked] = useState<number[]>([])
  const [feedback, setFeedback] = useState<Feedback>(null)
  const promptId = useId()

  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby={promptId}>
      <Prompt id={promptId}>{interaction.prompt}</Prompt>
      <div className="grid gap-2 sm:grid-cols-2">
        {interaction.options.map((option, index) => {
          const chosen = picked.includes(index)
          return (
            <button
              key={option.label}
              type="button"
              aria-pressed={chosen}
              disabled={done && !option.correct}
              onClick={() => {
                setPicked((current) => (current.includes(index) ? current : [...current, index]))
                setFeedback({ tone: option.correct ? 'good' : 'bad', text: option.feedback })
                if (option.correct) {
                  onDone()
                } else {
                  onMiss?.()
                }
              }}
              className={cx(
                'flex min-h-12 items-center gap-2 rounded-md border px-3 py-2 text-left text-support font-medium transition-colors',
                chosen && option.correct
                  ? 'border-success bg-success/10'
                  : chosen
                    ? 'border-warning/60 bg-warning/10 text-text-muted line-through decoration-warning/60'
                    : 'border-border-strong bg-panel-2 hover:bg-elevated',
              )}
            >
              {chosen && option.correct && <Check className="size-4 shrink-0 text-success" aria-hidden />}
              {option.label}
            </button>
          )
        })}
      </div>
      <FeedbackLine feedback={feedback} />
    </div>
  )
}

function CardChoice({ interaction, done, onDone, onMiss }: Props<'cards'>) {
  const [picked, setPicked] = useState<number[]>([])
  const [feedback, setFeedback] = useState<Feedback>(null)
  const promptId = useId()

  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby={promptId}>
      <Prompt id={promptId}>{interaction.prompt}</Prompt>
      <div className="grid gap-2 sm:grid-cols-3">
        {interaction.options.map((option, index) => {
          const chosen = picked.includes(index)
          return (
            <button
              key={option.name}
              type="button"
              aria-pressed={chosen}
              aria-label={`${option.name}: ${option.state}${option.battery !== undefined ? `, battery ${option.battery}%` : ''}${option.online === false ? ', offline' : ''}`}
              disabled={done && !option.correct}
              onClick={() => {
                setPicked((current) => (current.includes(index) ? current : [...current, index]))
                setFeedback({ tone: option.correct ? 'good' : 'bad', text: option.feedback })
                if (option.correct) {
                  onDone()
                } else {
                  onMiss?.()
                }
              }}
              className={cx(
                'rounded-lg border-2 p-0.5 transition-colors',
                chosen && option.correct ? 'border-success' : chosen ? 'border-warning/60 opacity-70' : 'border-transparent hover:border-border-strong',
              )}
            >
              <MockDoorCard name={option.name} state={option.state} battery={option.battery} online={option.online} reported={option.reported} />
            </button>
          )
        })}
      </div>
      <FeedbackLine feedback={feedback} />
    </div>
  )
}

function SortItems({ interaction, onDone, onMiss }: Props<'sort'>) {
  const [placed, setPlaced] = useState<Record<number, 0 | 1>>({})
  const [feedback, setFeedback] = useState<Feedback>(null)
  const promptId = useId()

  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby={promptId}>
      <Prompt id={promptId}>{interaction.prompt}</Prompt>
      <ul className="flex flex-col gap-2">
        {interaction.items.map((item, index) => {
          const settled = placed[index] === item.bin
          return (
            <li key={item.label} className={cx('flex flex-wrap items-center gap-2 rounded-md border p-2', settled ? 'border-success/50 bg-success/5' : 'border-border')}>
              <span className="min-w-0 flex-1 text-support font-medium">
                {settled && <Check className="mr-1 inline size-4 text-success" aria-hidden />}
                {item.label}
                {settled && <span className="sr-only">: {interaction.bins[item.bin]}</span>}
              </span>
              {!settled &&
                interaction.bins.map((bin, binIndex) => (
                  <button
                    key={bin}
                    type="button"
                    aria-label={`${item.label}: ${bin}`}
                    onClick={() => {
                      if (binIndex === item.bin) {
                        const next = { ...placed, [index]: item.bin }
                        setPlaced(next)
                        setFeedback({ tone: 'good', text: item.why })
                        if (interaction.items.every((other, otherIndex) => next[otherIndex] === other.bin)) {
                          onDone()
                        }
                      } else {
                        setFeedback({ tone: 'bad', text: `Hmm, not that one. ${item.why}` })
                        onMiss?.()
                      }
                    }}
                    className="min-h-11 rounded-md border border-border-strong bg-panel-2 px-3 text-label font-semibold hover:bg-elevated"
                  >
                    {bin}
                  </button>
                ))}
            </li>
          )
        })}
      </ul>
      <FeedbackLine feedback={feedback} />
    </div>
  )
}

function OrderSteps({ interaction, onDone, onMiss }: Props<'order'>) {
  // A fixed shuffle: reversed pairs, so the right order is never the order shown.
  const shown = useMemo(() => {
    const indexes = interaction.steps.map((_, index) => index)
    return [...indexes.slice(Math.ceil(indexes.length / 2)), ...indexes.slice(0, Math.ceil(indexes.length / 2))].reverse()
  }, [interaction.steps])
  const [next, setNext] = useState(0)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const promptId = useId()

  return (
    <div className="flex flex-col gap-3" role="group" aria-labelledby={promptId}>
      <Prompt id={promptId}>{interaction.prompt}</Prompt>
      <ol className="flex flex-col gap-2">
        {shown.map((stepIndex) => {
          const placed = stepIndex < next
          return (
            <li key={stepIndex}>
              <button
                type="button"
                disabled={placed}
                onClick={() => {
                  if (stepIndex === next) {
                    const after = next + 1
                    setNext(after)
                    setFeedback({ tone: 'good', text: after === interaction.steps.length ? 'Perfect order! Gold star.' : `Yes! That is step ${after}.` })
                    if (after === interaction.steps.length) {
                      onDone()
                    }
                  } else {
                    setFeedback({ tone: 'bad', text: 'Not yet! Something else happens before that one.' })
                    onMiss?.()
                  }
                }}
                className={cx(
                  'flex min-h-12 w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-support font-medium',
                  placed ? 'border-success/50 bg-success/10' : 'border-border-strong bg-panel-2 hover:bg-elevated',
                )}
              >
                <span
                  className={cx(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border text-label font-bold',
                    placed ? 'border-success bg-success text-bg' : 'border-border-strong text-text-muted',
                  )}
                  aria-hidden
                >
                  {placed ? stepIndex + 1 : '?'}
                </span>
                {interaction.steps[stepIndex]}
                {placed && <span className="sr-only">, step {stepIndex + 1}</span>}
              </button>
            </li>
          )
        })}
      </ol>
      <FeedbackLine feedback={feedback} />
    </div>
  )
}

function MultiChoice({ interaction, done, onDone, onMiss }: Props<'multi'>) {
  const [checked, setChecked] = useState<Set<number>>(() => new Set())
  const [feedback, setFeedback] = useState<Feedback>(null)
  const promptId = useId()

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-body font-semibold" id={promptId}>
        {interaction.prompt}
      </legend>
      {interaction.options.map((option, index) => (
        <label key={option.label} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border-strong bg-panel-2 px-3 py-2 text-support">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={checked.has(index)}
            disabled={done}
            onChange={() =>
              setChecked((current) => {
                const nextSet = new Set(current)
                if (nextSet.has(index)) {
                  nextSet.delete(index)
                } else {
                  nextSet.add(index)
                }
                return nextSet
              })
            }
          />
          {option.label}
        </label>
      ))}
      <div>
        <button
          type="button"
          disabled={done}
          onClick={() => {
            const right = interaction.options.every((option, index) => option.correct === checked.has(index))
            if (right) {
              setFeedback({ tone: 'good', text: 'Exactly right! You picked every one, and only those.' })
              onDone()
            } else {
              setFeedback({ tone: 'bad', text: interaction.hint })
              onMiss?.()
            }
          }}
          className="min-h-11 rounded-md bg-primary-strong px-4 text-support font-semibold text-white hover:bg-primary disabled:opacity-55"
        >
          Check my answer
        </button>
      </div>
      <FeedbackLine feedback={feedback} />
    </fieldset>
  )
}

function Reveal({ interaction, done, onDone }: Props<'reveal'>) {
  return (
    <div className="flex flex-col gap-3">
      <Prompt>{interaction.prompt}</Prompt>
      {done ? (
        <div className="pip-pop rounded-lg border border-primary/40 bg-primary/10 p-3 text-support">{interaction.revealed}</div>
      ) : (
        <div>
          <button
            type="button"
            onClick={onDone}
            className="min-h-12 rounded-full bg-primary-strong px-5 text-body font-semibold text-white shadow-glow-primary hover:bg-primary"
          >
            {interaction.button}
          </button>
        </div>
      )}
    </div>
  )
}

/** A pretend phone with a pretend door. Nothing is sent anywhere. */
function PracticeDoor({ interaction, done, onDone }: Props<'practice'>) {
  const isLock = interaction.action === 'lock'
  const [state, setState] = useState<MockDoorState>(isLock ? 'unlocked' : 'locked')
  const [confirming, setConfirming] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current)
    }
  }, [])

  function start(action: 'lock' | 'unlock') {
    setConfirming(false)
    setState(action === 'lock' ? 'locking' : 'unlocking')
    timer.current = setTimeout(() => {
      setState(action === 'lock' ? 'locked' : 'unlocked')
      if (action === interaction.action) {
        onDone()
      }
    }, PRACTICE_DELAY_MS)
  }

  const busy = state === 'locking' || state === 'unlocking'

  return (
    <div className="flex flex-col gap-3">
      <Prompt>{isLock ? 'Tap "Lock Practice Door" and watch the card.' : 'Unlock the practice door. Read the question it asks you before you answer.'}</Prompt>
      <div className="mx-auto w-full max-w-xs rounded-[1.75rem] border-4 border-border-strong bg-bg p-3 shadow-raised">
        <p className="mb-2 rounded-full bg-warning/15 px-3 py-1 text-center text-caption font-semibold text-warning">Practice mode: no real door moves</p>
        <div aria-live="polite">
          <MockDoorCard name="Practice Door" state={state} reported="just now" />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {confirming ? (
            <div role="alertdialog" aria-labelledby="practice-confirm-title" className="pip-pop rounded-lg border border-border-strong bg-elevated p-3">
              <p id="practice-confirm-title" className="text-support font-semibold">
                Unlock Practice Door?
              </p>
              <p className="mt-1 text-caption text-text-muted">Anyone at the door can walk in once it is unlocked.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setConfirming(false)} className="min-h-11 flex-1 rounded-md border border-border-strong bg-panel-2 text-support font-semibold">
                  Cancel
                </button>
                <button type="button" onClick={() => start('unlock')} className="min-h-11 flex-1 rounded-md bg-primary-strong text-support font-semibold text-white">
                  Unlock
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => start('lock')}
                className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-primary-strong text-body font-semibold text-white hover:bg-primary disabled:opacity-55"
              >
                <LockIcon className="size-5" aria-hidden />
                Lock Practice Door
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(true)}
                className="mt-2 flex min-h-12 items-center justify-center gap-2 rounded-md border border-border-strong bg-panel-2 text-body font-semibold hover:bg-elevated disabled:opacity-55"
              >
                <LockOpen className="size-5" aria-hidden />
                Unlock Practice Door
              </button>
            </>
          )}
        </div>
      </div>
      <FeedbackLine
        feedback={
          done
            ? { tone: 'good', text: isLock ? 'Locked, and the lock said so. That is how you know.' : 'Unlocked! You confirmed first, just like the real app asks.' }
            : busy
              ? { tone: 'good', text: 'On its way… the card waits for the lock to answer.' }
              : null
        }
      />
    </div>
  )
}

function BrowserQuestion({ done, onDone }: Omit<InteractionProps, 'interaction'>) {
  const [answer, setAnswer] = useState<'allow' | 'block' | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <Prompt>Your phone will ask a question like this one. Practice answering it:</Prompt>
      <BrowserLocationPrompt
        answered={answer}
        onAllow={() => {
          setAnswer('allow')
          onDone()
        }}
        onBlock={() => {
          setAnswer('block')
          onDone()
        }}
      />
      <FeedbackLine
        feedback={
          !done
            ? null
            : answer === 'allow'
              ? { tone: 'good', text: 'Allowed! LockGuard can now note where you are when you lock or unlock.' }
              : { tone: 'good', text: 'Blocked is OK too: locking and unlocking still work. You can change it later in your browser settings.' }
        }
      />
    </div>
  )
}
