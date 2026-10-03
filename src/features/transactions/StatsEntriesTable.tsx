import { useState } from 'react'
import { Search } from 'lucide-react'
import { fmtDateShort } from '@/lib/date'
import { Button, Input, Money, Select } from '@/ui'
import { matchesCategory } from './categories'
import type { ActivityStatsModel } from './ActivityStatsModel'

export function StatsEntriesTable({ stats, categoryQuery = '' }: { stats: ActivityStatsModel; categoryQuery?: string }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('included')
  const [kind, setKind] = useState('all')
  const [sort, setSort] = useState('amount')
  const [visible, setVisible] = useState(10)
  const query = search.trim().toLowerCase()
  const entries = stats.entries.filter((entry) => {
    if (!matchesCategory(entry.category, categoryQuery)) return false
    if (status === 'included' && entry.excluded) return false
    if (status === 'excluded' && !entry.excluded) return false
    if (kind !== 'all' && entry.kind !== kind) return false
    return `${entry.label} ${entry.cadence} ${entry.category ?? 'other'}`.toLowerCase().includes(query)
  })
  entries.sort((a, b) => {
    if (sort === 'date') return b.lastDate.localeCompare(a.lastDate)
    if (sort === 'name') return a.label.localeCompare(b.label)
    return b.amount - a.amount
  })
  let income = 0
  let spending = 0
  let excluded = 0
  for (const entry of entries) {
    if (entry.excluded) excluded += entry.amount
    else if (entry.kind === 'income') income += entry.amount
    else spending += entry.amount
  }

  return (
    <section className="overflow-hidden rounded-xl border border-line" aria-label="Stats contributors">
      <div className="space-y-3 bg-raised/30 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-serif text-lg text-ink">Behind the numbers</h3>
          <span className="text-xs text-faint">{entries.length} of {stats.entries.length} entries</span>
        </div>
        <div className="flex flex-wrap gap-1" aria-label="Contribution status">
          {[{ value: 'included', label: 'Contributing' }, { value: 'excluded', label: 'Set aside' }, { value: 'all', label: 'All entries' }].map((item) => (
            <Button key={item.value} size="sm" variant={status === item.value ? 'secondary' : 'ghost'} aria-pressed={status === item.value} onClick={() => { setStatus(item.value); setVisible(10) }}>{item.label}</Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-faint" />
            <Input aria-label="Search stats entries" placeholder="Find an entry…" value={search} onChange={(e) => { setSearch(e.target.value); setVisible(10) }} className="h-10 pl-9" />
          </div>
          <Select aria-label="Entry type" value={kind} onValueChange={(value) => { setKind(value); setVisible(10) }} className="h-10" options={[
            { value: 'all', label: 'Income & spending' }, { value: 'income', label: 'Income' }, { value: 'expense', label: 'Spending' },
          ]} />
          <Select aria-label="Sort stats entries" value={sort} onValueChange={(value) => { setSort(value); setVisible(10) }} className="h-10" options={[
            { value: 'amount', label: 'Largest first' }, { value: 'date', label: 'Newest first' }, { value: 'name', label: 'Name A–Z' },
          ]} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Entries in the selected date range. Shares are of included income or spending.</caption>
          <thead className="border-y border-line bg-sunken/40 text-[11px] uppercase tracking-wide text-faint">
            <tr><th scope="col" className="p-3 font-medium">Entry</th><th scope="col" className="p-3 font-medium">Dates</th><th scope="col" className="p-3 text-right font-medium">Period total</th><th scope="col" className="p-3 text-right font-medium">Share</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {entries.slice(0, visible).map((entry) => {
              const total = entry.kind === 'income' ? stats.income : stats.adjustedSpending
              const share = total > 0 ? entry.amount / total * 100 : 0
              return (
                <tr key={entry.id} className="transition-colors hover:bg-raised/40">
                  <th scope="row" className="min-w-44 p-3 font-normal">
                    <span className="block text-ink">{entry.label}</span>
                    <span className="block break-words text-xs text-muted">{entry.category || 'other'}</span>
                    <span className="text-xs text-faint">{entry.cadence}{entry.count > 1 ? ` · ${entry.count} ${entry.cadence === 'Daily accrual' ? 'days' : 'payments'}` : ''}</span>
                    {entry.excluded && <span className="ml-2 rounded-full bg-clay/10 px-2 py-0.5 text-[10px] text-clay">Set aside</span>}
                  </th>
                  <td className="whitespace-nowrap p-3 text-xs text-muted">{fmtDateShort(entry.date)}{entry.lastDate !== entry.date && <span className="block text-faint">– {fmtDateShort(entry.lastDate)}</span>}</td>
                  <td className={`whitespace-nowrap p-3 text-right ${entry.excluded ? 'text-faint' : entry.kind === 'income' ? 'text-sage' : 'text-rust'}`}><Money amount={entry.kind === 'income' ? entry.amount : -entry.amount} sign /></td>
                  <td className="min-w-24 p-3 text-right text-xs text-muted">
                    {entry.excluded ? '—' : <><span>{share.toFixed(1)}%</span><div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line"><div className={`h-full rounded-full ${entry.kind === 'income' ? 'bg-sage' : 'bg-clay'}`} style={{ width: `${Math.min(100, share)}%` }} /></div></>}
                  </td>
                </tr>
              )
            })}
            {entries.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-muted">No entries match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunken/30 p-3 text-xs text-muted">
        <div className="flex flex-wrap gap-x-4 gap-y-1"><span>Filtered income <Money amount={income} /></span><span>Spending <Money amount={spending} /></span>{excluded > 0 && <span>Set aside <Money amount={excluded} /></span>}</div>
        {entries.length > visible && <Button variant="ghost" size="sm" onClick={() => setVisible(visible + 10)}>Show 10 more</Button>}
      </div>
      <p className="px-3 py-2 text-[11px] text-faint">Recurring entries are combined for this range. Share is of included income or spending. Table filters don’t change your stats.</p>
    </section>
  )
}
