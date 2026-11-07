import { Check, Send, X } from 'lucide-react'
import { useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../../api/client'
import { answerQuiz, getQuiz, type QuizResult } from '../../api/invitations'
import { PipSays } from '../../components/onboarding/Pip'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'
import { LoadingState } from '../../components/ui/Spinner'
import { cx } from '../../lib/cx'
import { useLoaded } from '../../lib/useLoaded'

type QuizStepProps = { token: string; onPassed: () => void }

/**
 * The final quiz: the server picks the questions and marks them. Every answer must be right; a
 * wrong one gets a hint pointing back at its lesson, and can be changed and tried again.
 */
export function QuizStep({ token, onPassed }: QuizStepProps) {
  const quiz = useLoaded((signal) => getQuiz(token, signal), token)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<QuizResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  if (quiz.loading && !quiz.data) {
    return <LoadingState label="Pip is picking your questions…" />
  }
  if (!quiz.data) {
    return (
      <Banner tone="danger" title="The quiz could not be loaded" action={<Button variant="secondary" size="sm" onClick={quiz.reload}>Try again</Button>}>
        {quiz.error instanceof ApiError ? quiz.error.message : null}
      </Banner>
    )
  }

  const questions = quiz.data
  const unanswered = questions.filter((question) => !answers[question.id]).length
  const resultFor = (id: string) => result?.results.find((item) => item.id === id)
  const wrongCount = result ? result.results.filter((item) => !item.correct).length : 0

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (unanswered > 0) {
      setError(`Answer every question first. ${unanswered} to go!`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const marked = await answerQuiz(token, answers)
      setResult(marked)
      setBusy(false)
      if (marked.passed) {
        onPassed()
      } else {
        headingRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
      }
    } catch (caught) {
      setBusy(false)
      setError(caught instanceof ApiError ? caught.message : 'Your answers could not be sent. Try again.')
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <h2 ref={headingRef} className="text-page-title">
        The big quiz
      </h2>
      <div aria-live="polite">
        {result && !result.passed ? (
          <PipSays mood="oops">
            <p>
              So close! {questions.length - wrongCount} of {questions.length} right. Look for my hints on the ones marked "Try again", change those
              answers, and send them again.
            </p>
          </PipSays>
        ) : (
          <PipSays mood="think">
            <p>
              Five questions about what you just learned. You need every one right to register your phone, but don't worry: if you miss one, I'll
              give you a hint and you can try again.
            </p>
          </PipSays>
        )}
      </div>

      {questions.map((question, index) => {
        const marked = resultFor(question.id)
        return (
          <div
            key={question.id}
            className={cx(
              'rounded-lg border bg-panel p-4',
              marked?.correct ? 'border-success/60' : marked ? 'border-warning/60' : 'border-border',
            )}
          >
            <fieldset>
              <legend className="w-full">
                <span className="block text-caption font-semibold text-text-muted">
                  Question {index + 1} of {questions.length}
                </span>
                <span className="mt-1 block text-body font-semibold">{question.question}</span>
              </legend>
              <div className="mt-3 flex flex-col gap-2">
                {question.choices.map((choice) => (
                  <label
                    key={choice.id}
                    className={cx(
                      'flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-support',
                      answers[question.id] === choice.id ? 'border-primary bg-primary/10' : 'border-border-strong bg-panel-2',
                      marked?.correct && 'cursor-default',
                    )}
                  >
                    <input
                      type="radio"
                      name={question.id}
                      value={choice.id}
                      className="size-5 shrink-0 accent-primary"
                      checked={answers[question.id] === choice.id}
                      disabled={marked?.correct === true}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: choice.id }))}
                    />
                    {choice.text}
                  </label>
                ))}
              </div>
              {marked && (
                <p className={cx('mt-3 flex items-start gap-1.5 text-support font-medium', marked.correct ? 'text-success' : 'text-warning')}>
                  {marked.correct ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : <X className="mt-0.5 size-4 shrink-0" aria-hidden />}
                  {marked.correct ? 'Correct!' : `Try again. Hint: ${marked.hint}`}
                </p>
              )}
            </fieldset>
          </div>
        )
      })}

      {error && <Banner tone="warning" title={error} />}

      <div>
        <Button type="submit" icon={Send} size="lg" loading={busy}>
          {result ? 'Send my answers again' : 'Send my answers'}
        </Button>
      </div>
    </form>
  )
}
