import { ArrowLeft, ArrowRight, Laugh, Lightbulb } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { completeLesson, type InvitationView } from '../../api/invitations'
import { InteractionView } from '../../components/onboarding/interactions'
import { lessons } from '../../components/onboarding/lessons'
import { PipSays, type PipMood } from '../../components/onboarding/Pip'
import { Banner } from '../../components/ui/Banner'
import { Button } from '../../components/ui/Button'

type TrainingStepProps = {
  token: string
  view: InvitationView
  onChange: (view: InvitationView) => void
}

/**
 * The lessons, one slide at a time. Each slide has something to do, and Next stays off until it
 * is done. Finishing a lesson is recorded on the server, which opens the quiz after the last one.
 */
export function TrainingStep({ token, view, onChange }: TrainingStepProps) {
  const firstOpen = Math.max(0, lessons.findIndex((lesson) => !view.lessons_completed.includes(lesson.key)))
  const [lessonIndex, setLessonIndex] = useState(firstOpen)
  const [slideIndex, setSlideIndex] = useState(0)
  const [doneSlides, setDoneSlides] = useState<Set<string>>(() => new Set())
  const [missed, setMissed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  const lesson = lessons[lessonIndex]
  const slide = lesson.slides[slideIndex]
  const slideKey = `${lesson.key}/${slide.id}`
  const done = doneSlides.has(slideKey)
  const lastSlide = slideIndex === lesson.slides.length - 1
  const mood: PipMood = done ? 'cheer' : missed ? 'oops' : slide.mood

  useEffect(() => {
    headingRef.current?.focus()
    headingRef.current?.scrollIntoView?.({ block: 'center' })
  }, [lessonIndex, slideIndex])

  async function next() {
    setError(null)
    if (!lastSlide) {
      setSlideIndex((index) => index + 1)
      setMissed(false)
      return
    }
    setSaving(true)
    try {
      const updated = await completeLesson(token, lesson.key)
      setSaving(false)
      setMissed(false)
      if (lessonIndex < lessons.length - 1) {
        setLessonIndex(lessonIndex + 1)
        setSlideIndex(0)
      }
      onChange(updated)
    } catch (caught) {
      setSaving(false)
      setError(caught instanceof ApiError ? caught.message : 'Your progress could not be saved. Try again.')
    }
  }

  const totalSlides = lessons.reduce((sum, item) => sum + item.slides.length, 0)
  const slidesBefore = lessons.slice(0, lessonIndex).reduce((sum, item) => sum + item.slides.length, 0) + slideIndex
  const percent = Math.round((slidesBefore / totalSlides) * 100)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-label font-semibold text-primary-text">
            Lesson {lessonIndex + 1} of {lessons.length}: {lesson.title}
          </p>
          <p className="text-caption text-text-muted">
            Part {slideIndex + 1} of {lesson.slides.length}
          </p>
        </div>
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-panel-2"
          role="progressbar"
          aria-label="Training progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <section aria-labelledby="slide-title" className="flex flex-col gap-5" key={slideKey}>
        <h2 id="slide-title" ref={headingRef} tabIndex={-1} className="text-page-title outline-none">
          {slide.title}
        </h2>

        <PipSays mood={mood}>
          {slide.pip.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </PipSays>

        {slide.picture && <div className="flex justify-center rounded-lg border border-border bg-panel p-4">{slide.picture}</div>}

        <div className="rounded-lg border border-primary/40 bg-panel p-4 shadow-glow-primary">
          <p className="mb-2 text-caption font-semibold tracking-wide text-primary-text uppercase">Your turn</p>
          <InteractionView
            interaction={slide.interaction}
            done={done}
            onDone={() => {
              setMissed(false)
              setDoneSlides((current) => new Set(current).add(slideKey))
            }}
            onMiss={() => setMissed(true)}
          />
        </div>

        {done && (
          <div className="pip-pop flex flex-col gap-3">
            <p className="rounded-lg border border-success/40 bg-success/10 px-4 py-3 text-body font-semibold text-success">Pip says: {slide.cheer}</p>
            <div className="grid gap-3 md:grid-cols-2">
              <aside aria-label="Food for thought" className="rounded-lg border border-warning/40 bg-warning/10 p-4">
                <p className="flex items-center gap-2 text-label font-semibold text-warning">
                  <Lightbulb className="size-4" aria-hidden />
                  Food for thought
                </p>
                <p className="mt-1 text-support">{slide.thought}</p>
              </aside>
              <aside aria-label="Pip's joke" className="rounded-lg border border-highlight/40 bg-highlight/10 p-4">
                <p className="flex items-center gap-2 text-label font-semibold text-highlight">
                  <Laugh className="size-4" aria-hidden />
                  Pip's joke
                </p>
                <p className="mt-1 text-support">{slide.joke}</p>
              </aside>
            </div>
          </div>
        )}
      </section>

      {error && <Banner tone="danger" title="Could not save your progress">{error}</Banner>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button
          variant="ghost"
          icon={ArrowLeft}
          disabled={slideIndex === 0}
          onClick={() => {
            setSlideIndex((index) => index - 1)
            setMissed(false)
          }}
        >
          Back
        </Button>
        <div className="flex flex-col items-end gap-1">
          <Button icon={ArrowRight} onClick={next} disabled={!done} loading={saving} size="lg">
            {lastSlide ? (lessonIndex === lessons.length - 1 ? 'Finish the lessons' : 'Finish this lesson') : 'Next'}
          </Button>
          {!done && <p className="text-caption text-text-muted">Finish "Your turn" to continue.</p>}
        </div>
      </div>
    </div>
  )
}
