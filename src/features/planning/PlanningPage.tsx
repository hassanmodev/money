import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'

export default function PlanningPage() {
  return (
    <Page>
      <PageHeader title="Planning" subtitle="Where today's choices take you." />
      <div className="card-surface grid h-64 place-items-center text-faint">
        The projection is coming together…
      </div>
    </Page>
  )
}
