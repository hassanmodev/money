import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'

export default function SettingsPage() {
  return (
    <Page>
      <PageHeader title="Settings" subtitle="Base currency, exchange rates, and your data." />
      <div className="card-surface grid h-64 place-items-center text-faint">
        Settings coming together…
      </div>
    </Page>
  )
}
