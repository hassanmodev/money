import { Repeat } from 'lucide-react'
import { ActivityLedger, describeRecurrence } from '@/domain'
import { useFinanceState } from '@/store/selectors'
import { useStore } from '@/store/store'
import { Button, Card, Money } from '@/ui'
import { useComposer } from './ComposerProvider'
import { matchesCategory } from './categories'

export function BlueprintList({ categoryQuery }: { categoryQuery: string }) {
  const state = useFinanceState()
  const stopBlueprint = useStore((s) => s.stopBlueprint)
  const composer = useComposer()
  const blueprints = new ActivityLedger(state).current().filter((tx) => matchesCategory(tx.category, categoryQuery))
  if (!blueprints.length) return null
  return <Card className="mb-4 p-4">
    <h2 className="text-sm font-medium text-ink">Blueprints</h2>
    <p className="mt-1 mb-3 text-xs text-faint">Repeating plans create linked activities. Edits affect today and future dates.</p>
    <div className="flex flex-col gap-3">
      {blueprints.map((tx) => <div key={tx.id} className="flex flex-wrap items-center gap-3">
        <Repeat className="size-4 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-ink">{tx.note || tx.category || tx.kind}</div>
          <div className="text-xs text-faint">{describeRecurrence(tx.recurrence!)}{tx.recurrence?.dailyAccrual ? ' · daily accrual' : ''}</div>
        </div>
        <Money amount={tx.amount} currency={tx.currency} />
        <Button variant="ghost" size="sm" onClick={() => composer.edit(tx)}>Edit blueprint</Button>
        <Button variant="ghost" size="sm" onClick={() => stopBlueprint(tx.id)}>Stop</Button>
      </div>)}
    </div>
  </Card>
}
