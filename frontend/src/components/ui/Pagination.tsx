import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cx } from '../../lib/cx'
import { Button } from './Button'

type PaginationProps = {
  /** 1-based. */
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  /** Names the navigation landmark, when a page has more than one paginated list. */
  label?: string
  className?: string
}

/** Previous and next controls with the current position. Hidden when there is only one page. */
export function Pagination({ page, pageCount, onPageChange, label = 'Pagination', className }: PaginationProps) {
  if (pageCount <= 1) {
    return null
  }

  return (
    <nav aria-label={label} className={cx('flex items-center justify-between gap-3', className)}>
      <Button variant="secondary" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        Previous
      </Button>
      <p className="text-support text-text-muted" aria-live="polite">
        Page <span className="text-text">{page}</span> of {pageCount}
      </p>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= pageCount}
        onClick={() => onPageChange(page + 1)}
        className="flex-row-reverse"
        icon={ChevronRight}
      >
        Next
      </Button>
    </nav>
  )
}
