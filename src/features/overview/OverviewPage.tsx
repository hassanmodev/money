import { ArrowUpRight, CalendarClock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Page } from '@/components/Page'
import { addYearsISO, fmtDate, todayISO } from '@/lib/date'
import { fmtSignedPercent } from '@/lib/format'
import { useActiveBoxes, useBoxValue, useGoalPlan, useNetWorth, useProjection } from '@/store/selectors'
import type { Box } from '@/domain'
import { Card, Chip, Money, Sparkline } from '@/ui'
import { boxIcon, KIND_LABEL } from '@/ui/icons'
import { horizonLabel } from '@/features/planning/horizon'
import { summarizeValue } from '@/features/goals/helpers'
import { ActivityList } from '@/features/transactions/ActivityList'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function Hero() {
  const net = useNetWorth()
  const from = todayISO()
  const proj = useProjection({ from, to: addYearsISO(from, 5), steps: 60 })
  const series = proj.points.map((p) => p.nominal)
  const growth = net > 0 ? proj.endNominal / net - 1 : 0

  return (
    <Card className="relative overflow-hidden">
      <div className="relative z-10 px-6 pb-24 pt-7 md:px-8 md:pt-8">
        <div className="text-sm text-muted">{greeting()}.</div>
        <div className="mt-5 text-[11px] uppercase tracking-[0.12em] text-faint">Net worth</div>
        <Money amount={net} animate className="font-serif text-5xl text-ink md:text-6xl" />
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
      <Money amount={value} currency={box.currency} compact className="text-sm tabular text-ink" />
    </Link>
  )
}

/** The next few goals the plan brings within reach — a teaser into /goals. */
function UpcomingGoals() {
  const plan = useGoalPlan(120)
  if (plan.items.length === 0) return null
  const upcoming = plan.items
    .filter((it) => it.reachYear !== null)
    .sort((a, b) => (a.reachYear ?? 0) - (b.reachYear ?? 0))
    .slice(0, 3)

  return (
    <section className="mt-6">
      <SectionHead title="On the horizon" to="/goals" />
      <Card className="p-2">
        {upcoming.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-faint">
            No goals land within ten years yet — open Goals to see what it would take.
          </p>
        ) : (
          <div className="flex flex-col">
            {upcoming.map((it) => {
              const color = it.goal.color ?? '#d4845c'
              return (
                <Link
                  key={it.goal.id}
                  to="/goals"
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-raised/60"
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{it.goal.label}</div>
                    <div className="text-xs text-faint">{summarizeValue(it.goal.value)}</div>
                  </div>
                  <div className="hidden text-xs text-muted sm:flex sm:items-center sm:gap-1.5">
                    <CalendarClock className="size-3.5 text-faint" />
                    {fmtDate(it.reachDate!)}
                  </div>
                  <Chip dot={color}>in {horizonLabel(Math.max(1, Math.round((it.reachYear ?? 0) * 12)))}</Chip>
                </Link>
              )
            })}
          </div>
        )}
      </Card>
    </section>
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
      <UpcomingGoals />
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
