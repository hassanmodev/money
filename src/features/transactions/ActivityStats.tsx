import { useMemo, useState } from 'react'
import { endOfMonth, parseISO, startOfMonth, startOfYear, subMonths } from 'date-fns'
import { ArrowDownLeft, ArrowUpRight, SlidersHorizontal, Wallet } from 'lucide-react'
import { addDaysISO, toISO } from '@/lib/date'
import { useFinanceState, usePlannedBuys } from '@/store/selectors'
import { useToday, useViewDate } from '@/store/time'
import { Button, Card, Input, Money, Switch } from '@/ui'
import { ActivityStatsModel } from './ActivityStatsModel'
import { SpendingTree } from './SpendingTree'
import { StatsEntriesTable } from './StatsEntriesTable'

export function ActivityStats({ categoryQuery = '' }: { categoryQuery?: string }) {
  const state = useFinanceState()
  const planned = usePlannedBuys()
  const cursor = useViewDate()
  const today = useToday()
  const [preset, setPreset] = useState('This month')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [ignoreUnusual, setIgnoreUnusual] = useState(true)
  const [multiplier, setMultiplier] = useState(5)
  const [averageDays, setAverageDays] = useState(1)
  const date = parseISO(cursor)
  const previousMonth = subMonths(date, 1)
  const presets = [
    { label: 'This month', from: toISO(startOfMonth(date)), to: cursor },
    { label: 'Last month', from: toISO(startOfMonth(previousMonth)), to: toISO(endOfMonth(previousMonth)) },
    { label: '30 days', from: addDaysISO(cursor, -29), to: cursor },
    { label: '90 days', from: addDaysISO(cursor, -89), to: cursor },
    { label: 'This year', from: toISO(startOfYear(date)), to: cursor },
  ]
  const range = presets.find((item) => item.label === preset) ?? custom
  const valid = Boolean(range.from && range.to && range.from <= range.to)
  const stats = useMemo(() => valid
    ? new ActivityStatsModel(state, range.from, range.to, ignoreUnusual ? multiplier : Infinity, planned)
    : null, [state, range.from, range.to, ignoreUnusual, multiplier, planned, valid])
  const adjusted = Boolean(stats?.excluded)

  function changeDate(field: 'from' | 'to', value: string) {
    setCustom({ ...range, [field]: value })
    setPreset('Custom')
  }

  return (
    <Card className="my-6 overflow-hidden">
      <div className="bg-gradient-to-br from-sage/10 via-surface to-clay/10 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-sage">The bigger picture</div>
            <h2 className="font-serif text-2xl text-ink">Your money, in perspective</h2>
            <p className="mt-1 text-xs text-muted">Income, spending, and room to save.</p>
          </div>
          {stats && <span className="rounded-full border border-line bg-sunken/40 px-3 py-1.5 text-xs text-muted">{stats.days} days · {state.settings.baseCurrency}{range.to > today ? ' · Includes forecast' : ''}</span>}
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5" aria-label="Statistics date shortcuts">
          {presets.map((item) => (
            <Button key={item.label} size="sm" variant={preset === item.label ? 'primary' : 'ghost'} aria-pressed={preset === item.label} onClick={() => setPreset(item.label)}>{item.label}</Button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">From<Input type="date" aria-label="Statistics start date" value={range.from} max={range.to} onChange={(e) => changeDate('from', e.target.value)} className="h-9 w-40" /></label>
          <label className="flex items-center gap-2 text-xs text-muted">To<Input type="date" aria-label="Statistics end date" value={range.to} min={range.from} onChange={(e) => changeDate('to', e.target.value)} className="h-9 w-40" /></label>
        </div>
      </div>
      {!stats ? <p role="alert" className="p-5 text-sm text-rust">Choose a start date and an end date on or after it.</p> : <>
        <label className="flex cursor-pointer items-center justify-between gap-4 border-y border-line bg-sage/5 px-5 py-3">
          <span><span className="block text-sm text-ink">Ignore big one-offs</span><span className="text-xs text-muted">Keep unusual purchases out of your everyday pace.</span></span>
          <Switch checked={ignoreUnusual} onCheckedChange={setIgnoreUnusual} aria-label="Ignore big one-offs" />
        </label>
        <div className="grid gap-px bg-line sm:grid-cols-3">
          <div className="bg-surface p-5">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted"><ArrowDownLeft className="size-4 text-sage" />Income</div>
            <Money amount={stats.income} className="break-words font-serif text-xl md:text-2xl xl:text-3xl text-sage" />
            <p className="mt-2 text-xs text-faint">Earned over {stats.days} days</p>
          </div>
          <div className="bg-surface p-5">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted"><ArrowUpRight className="size-4 text-rust" />{adjusted ? 'Adjusted spending' : 'Spending'}</div>
            <Money amount={stats.adjustedSpending} className="break-words font-serif text-xl md:text-2xl xl:text-3xl text-rust" />
            <p className="mt-2 text-xs text-faint">Full spending <Money amount={stats.spending} /></p>
          </div>
          <div className="bg-surface p-5">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted"><Wallet className="size-4 text-honey" />{adjusted ? 'Adjusted money left' : 'Money left'}</div>
            <Money amount={stats.left} className={`break-words font-serif text-xl md:text-2xl xl:text-3xl ${stats.left < 0 ? 'text-rust' : 'text-honey'}`} />
            <p className="mt-2 text-xs text-faint">{stats.savingsRate === null ? 'Savings rate unavailable without income' : `${stats.savingsRate.toFixed(1)}% savings rate`}</p>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted">Your average pace{adjusted ? ' · adjusted' : ''}</span>
            <div className="flex gap-1 rounded-xl bg-sunken/40 p-1" aria-label="Average duration">
              {[{ label: 'Day', days: 1 }, { label: 'Week', days: 7 }, { label: 'Month', days: 365.25 / 12 }].map((item) => (
                <Button key={item.label} size="sm" variant={averageDays === item.days ? 'secondary' : 'ghost'} aria-pressed={averageDays === item.days} onClick={() => setAverageDays(item.days)}>{item.label}</Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div><span className="text-faint">In </span><Money amount={stats.average(stats.income, averageDays)} /></div>
            <div><span className="text-faint">Out </span><Money amount={stats.average(stats.adjustedSpending, averageDays)} /></div>
            <div><span className="text-faint">Left </span><Money amount={stats.average(stats.left, averageDays)} /></div>
          </div>
          <p className="text-[11px] leading-relaxed text-faint">Averages use all {stats.days} calendar days{averageDays > 7 ? '; a month is 30.44 days' : ''}. Money left is income minus spending, not your account balance. Includes recurring entries and goal purchases; excludes transfers and investment growth.</p>
          {ignoreUnusual && <details className="rounded-xl border border-line bg-sunken/30 p-3">
            <summary className="cursor-pointer text-sm text-muted"><SlidersHorizontal className="mr-2 inline size-4 text-clay" />{stats.excludedPurchases.length} purchases set aside · Adjust sensitivity</summary>
            <label className="mt-4 block text-xs text-muted">Sensitivity
              <input type="range" min="2" max="10" step="1" value={multiplier} onChange={(e) => setMultiplier(Number(e.target.value))} className="mt-3 block w-full accent-clay" />
            </label>
            <div className="mt-1 flex justify-between text-xs text-faint"><span>More filtering</span><span>Only the biggest</span></div>
            <p className="my-3 text-xs leading-relaxed text-muted">{stats.threshold === null
              ? 'Add at least 3 expense entries to detect unusual purchases. Everything is included for now.'
              : <>One-offs above <Money amount={stats.threshold} /> are set aside ({multiplier}× your median expense size over the past year). Recurring bills always count.</>}</p>
          </details>}
          {adjusted && <p className="text-xs text-honey"><Money amount={stats.excluded} /> set aside. Full money left: <Money amount={stats.income - stats.spending} />. Exclusions apply only to this view.</p>}
          <SpendingTree stats={stats} query={categoryQuery} />
          <StatsEntriesTable stats={stats} categoryQuery={categoryQuery} />
        </div>
      </>}
    </Card>
  )
}
