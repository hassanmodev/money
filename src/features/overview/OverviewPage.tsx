import { ArrowUpRight, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Page } from '@/components/Page'
import { addYearsISO } from '@/lib/date'
import { fmtSignedPercent } from '@/lib/format'
import {
  useActiveBoxes,
  useBoxValue,
  useGoalAutoApply,
  useNetWorthWithPlannedGoals,
  useNetWorthWithoutPlannedGoals,
  useProjection,
} from '@/store/selectors'
import { useStore } from '@/store/store'
import { useViewDate } from '@/store/time'
import type { Box } from '@/domain'
import { Card, Money, Sparkline, Switch } from '@/ui'
import { boxIcon, KIND_LABEL } from '@/ui/icons'
import { ActivityList } from '@/features/transactions/ActivityList'
import { ActivityStats } from '@/features/transactions/ActivityStats'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function Hero() {
  const fullNet = useNetWorthWithoutPlannedGoals(undefined, false)
  const goalNet = useNetWorthWithPlannedGoals(undefined, false)
  const includingAssets = useNetWorthWithoutPlannedGoals()
  const includingAssetsWithGoals = useNetWorthWithPlannedGoals()
  const autoApply = useGoalAutoApply()
  const updateSettings = useStore((s) => s.updateSettings)
  const from = useViewDate()
  const proj = useProjection({ from, to: addYearsISO(from, 5), steps: 60, includeAssets: false })
  const series = proj.points.map((p) => p.nominal)
  const growth = fullNet > 0 ? proj.endNominal / fullNet - 1 : 0
  const goalDelta = goalNet - fullNet

  return (
    <Card className="relative overflow-hidden">
      <div className="relative z-10 px-6 pb-24 pt-7 md:px-8 md:pt-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-sm text-muted">{greeting()}.</div>
            <div className="mt-5 text-[11px] uppercase tracking-[0.12em] text-faint">Net worth · regular boxes</div>
            <Money report amount={fullNet} animate className="font-serif text-3xl text-ink sm:text-5xl md:text-6xl" />
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted">
              <span>with planned goals</span>
              <Money report reportInline amount={goalNet} compact className="font-medium tabular text-ink" />
              <Money
                report
                reportInline
                amount={goalDelta}
                compact
                sign
                className={goalDelta < 0 ? 'tabular text-rust' : 'tabular text-sage'}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span>including assets</span>
                <Money report reportInline amount={includingAssets} compact className="tabular text-ink" />
              </span>
              <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span>with planned goals</span>
                <Money report reportInline amount={includingAssetsWithGoals} compact className="tabular text-ink" />
              </span>
            </div>
          </div>

          <label className="flex shrink-0 cursor-pointer items-center gap-3 rounded-xl border border-line bg-raised/45 px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sage/15 text-sage">
              <Target className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-medium text-ink">Auto-apply goals</span>
              <span className="block text-[11px] text-faint">{autoApply ? 'On' : 'Paused'}</span>
            </span>
            <Switch
              checked={autoApply}
              onCheckedChange={(goalAutoApply) => updateSettings({ goalAutoApply })}
              aria-label="Auto-apply goals"
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-2 text-sm text-muted">
          <span className="inline-flex items-center gap-1 text-sage">
            <ArrowUpRight className="size-4" />
            {fmtSignedPercent(growth)}
          </span>
          projected over the next 5 years
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28">
        <Sparkline data={series} color="#d4845c" width={900} height={112} strokeWidth={2} className="h-full w-full" />
      </div>
    </Card>
  )
}

function BoxTile({ box }: { box: Box }) {
  const value = useBoxValue(box.id)
  const Icon = boxIcon(box)
  return (
    <Link
      to="/boxes"
      className="card-surface flex items-center gap-3 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-line-2"
    >
      <div className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${box.color}1f`, color: box.color }}>
        <Icon className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-ink">{box.name}</div>
        <div className="text-xs text-faint">{KIND_LABEL[box.kind]}</div>
      </div>
      <span className="min-w-0 text-right">
        <Money report amount={value} currency={box.currency} compact className="text-sm tabular text-ink" />
      </span>
    </Link>
  )
}

function SectionHead({ title, to }: { title: string; to: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-serif text-xl text-ink">{title}</h2>
      <Link to={to} className="text-sm text-clay transition-colors hover:text-honey">
        See all →
      </Link>
    </div>
  )
}

export default function OverviewPage() {
  const boxes = useActiveBoxes()
  return (
    <Page>
      <Hero />
      <ActivityStats />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHead title="Your boxes" to="/boxes" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {boxes.map((b) => (
              <BoxTile key={b.id} box={b} />
            ))}
          </div>
        </section>
        <section>
          <SectionHead title="Recent activity" to="/activity" />
          <Card className="p-3">
            <ActivityList limit={6} />
          </Card>
        </section>
      </div>
    </Page>
  )
}
