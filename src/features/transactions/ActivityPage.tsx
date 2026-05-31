import { Plus } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/ui'
import { Button } from '@/ui'
import { useComposer } from './ComposerProvider'
import { ActivityList } from './ActivityList'

export default function ActivityPage() {
  const composer = useComposer()
  return (
    <Page>
      <PageHeader
        title="Activity"
        subtitle="Everything that moved — one-offs and the recurring beats."
        actions={
          <Button onClick={() => composer.open()}>
            <Plus className="size-4" />
            Add entry
          </Button>
        }
      />
      <Card className="p-3 md:p-4">
        <ActivityList />
      </Card>
    </Page>
  )
}
