import { Money } from '@/ui'
import type { ActivityStatsModel } from './ActivityStatsModel'
import { spendingTree, type CategoryNode } from './categoryTree'

function Branch({ node }: { node: CategoryNode }) {
  return <details className="min-w-0 border-l border-line pl-3">
    <summary className="cursor-pointer rounded-lg py-2 text-sm text-ink hover:bg-raised/40">
      <span className="inline-flex w-[calc(100%-1.5rem)] items-center justify-between gap-3 align-middle">
        <span className="min-w-0 break-words">{node.label}<span className="ml-2 text-[11px] text-faint">{node.count}</span></span>
        <Money amount={node.amount} className="shrink-0 tabular text-rust" />
      </span>
    </summary>
    <div className="space-y-1 pb-2">
      {node.children.map((child) => <Branch key={child.path} node={child} />)}
      {node.entries.map((entry) => <div key={entry.id} className="flex justify-between gap-3 py-1 pl-3 text-xs text-muted">
        <span className="min-w-0 break-words">{entry.label}<span className="block text-[11px] text-faint">{entry.cadence}</span></span>
        <Money amount={entry.amount} className="shrink-0" />
      </div>)}
    </div>
  </details>
}

export function SpendingTree({ stats, query }: { stats: ActivityStatsModel; query: string }) {
  const nodes = spendingTree(stats.entries, query)
  return <section aria-label="Spending by category" className="rounded-xl border border-line p-4">
    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-serif text-lg text-ink">Spending by category</h3>
      <Money amount={nodes.reduce((sum, node) => sum + node.amount, 0)} className="text-sm text-rust" />
    </div>
    <p className="mb-3 text-xs text-faint">Expand a category to explore its levels and properties. Uses this date range and excludes purchases set aside.{query && ' Showing matching tags.'}</p>
    {nodes.map((node) => <Branch key={node.path} node={node} />)}
    {!nodes.length && <p className="py-4 text-center text-sm text-muted">No spending matches this view.</p>}
  </section>
}
