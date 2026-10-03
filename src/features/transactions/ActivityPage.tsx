import { useState } from 'react'
import { Input } from '@/ui'
import { Plus } from 'lucide-react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { Card } from '@/ui'
import { Button } from '@/ui'
import { useComposer } from './ComposerProvider'
import { ActivityList } from './ActivityList'
import { ActivityStats } from './ActivityStats'

export default function ActivityPage() {
  const composer = useComposer()
  const [categoryQuery, setCategoryQuery] = useState('')
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
      <div className="mt-5">
        <label htmlFor="activity-category" className="mb-2 block text-xs text-muted">Filter by category, path, or property</label>
        <Input id="activity-category" placeholder="groceries, groceries.online, laptop, or place:online" value={categoryQuery} onChange={(e) => setCategoryQuery(e.target.value)} />
        <p className="mt-2 text-xs text-faint">Matches any whole segment or path. Filters the spending tree, entries table, and activity feed; summary totals stay unchanged.</p>
      </div>
      <ActivityStats categoryQuery={categoryQuery} />
      <Card className="p-3 md:p-4">
        <ActivityList categoryQuery={categoryQuery} />
      </Card>
    </Page>
  )
}
