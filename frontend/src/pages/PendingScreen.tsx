import { Hammer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'

type PendingScreenProps = {
  title: string
  description: ReactNode
  /** The UI checkpoint that builds this screen. */
  checkpoint: number
}

/**
 * A screen whose navigation and permissions are in place but whose content is still being built.
 * It says so plainly and shows no data. Every use is replaced by its checkpoint; UI checkpoint 9
 * verifies none remain.
 */
export function PendingScreen({ title, description, checkpoint }: PendingScreenProps) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState
          icon={Hammer}
          title="This screen is not built yet"
          description={`It arrives with UI checkpoint ${checkpoint}. Nothing here is live data.`}
        />
      </Card>
    </>
  )
}
