import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'

export default function OverviewPage() {
  return (
    <Page>
      <PageHeader title="Overview" subtitle="Your money at a glance." />
      <div className="card-surface grid h-64 place-items-center text-faint">
        Overview coming together…
      </div>
    </Page>
  )
}
