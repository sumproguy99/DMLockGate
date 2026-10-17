import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { LoadingState } from './Spinner'

export type Column<Row> = {
  key: string
  header: ReactNode
  cell: (row: Row) => ReactNode
  align?: 'left' | 'right'
  /** Extra classes for the header and cells, such as a width or "hidden md:table-cell". */
  className?: string
}

type DataTableProps<Row> = {
  /** Names the table for screen readers. Visible unless captionHidden. */
  caption: string
  captionHidden?: boolean
  columns: ReadonlyArray<Column<Row>>
  rows: ReadonlyArray<Row>
  rowKey: (row: Row) => string | number
  loading?: boolean
  /** Shown in place of the rows when there are none. */
  empty?: ReactNode
  className?: string
}

/**
 * A semantic table. It scrolls sideways inside its own frame when the screen is too narrow, so the
 * page never does.
 */
export function DataTable<Row>({
  caption,
  captionHidden = false,
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  className,
}: DataTableProps<Row>) {
  const align = (column: Column<Row>) => (column.align === 'right' ? 'text-right' : 'text-left')

  return (
    <div className={cx('overflow-x-auto rounded-md border border-border', className)}>
      <table className="w-full border-collapse text-support" aria-busy={loading || undefined}>
        <caption className={cx('px-4 py-3 text-left text-panel-title', captionHidden && 'sr-only')}>{caption}</caption>
        <thead className="bg-panel-2">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cx('px-4 py-2.5 text-label whitespace-nowrap text-text-muted', align(column), column.className)}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6">
                <LoadingState />
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length}>{empty ?? <p className="px-4 py-6 text-text-muted">Nothing to show.</p>}</td>
            </tr>
          )}
          {!loading &&
            rows.map((row) => (
              <tr key={rowKey(row)} className="border-t border-border transition-colors hover:bg-panel-2/60">
                {columns.map((column) => (
                  <td key={column.key} className={cx('px-4 py-3 align-middle', align(column), column.className)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
