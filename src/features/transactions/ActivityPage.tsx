import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'

export default function ActivityPage() {
  return (
    <Page>
      <PageHeader title="Activity" subtitle="Everything that moved." />
      <div className="card-surface grid h-64 place-items-center text-faint">
        Activity coming together…
      </div>
    </Page>
  )
}
