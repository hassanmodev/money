import { ArrowUp, Sparkles, Target, Plus, Wallet } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { goalHappiness, umbrellaSources, type Goal, type HappinessOptions } from '@/domain'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { addMonthsISO, fmtMonthYear } from '@/lib/date'
import { useActiveBoxes, useBankedHappiness, useGoalBudget, useGoalFundingBoxes, useGoalGroups, useGoals, useScheduledPlan } from '@/store/selectors'
import { useViewDate } from '@/store/time'
import { useStore } from '@/store/store'
import { Button, Card, Chip, Money, Segmented } from '@/ui'
import { GoalCard } from './GoalCard'
import { GoalEditor } from './GoalEditor'
import { GoalStack } from './GoalStack'
import { HappinessChart, type HappinessTrack } from './HappinessChart'
import { STATUS_META, STATUS_ORDER } from './goal-meta'

const HORIZON_MONTHS = 48
const HALF_LIFE_PRESETS = [
  { value: '12', label: 'Now' },
  { value: '24', label: 'Balanced' },
  { value: '48', label: 'Long view' },
]

function Stat({ label, value, accent }: { label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className={accent ? 'mt-1 font-serif text-xl text-sage' : 'mt-1 font-serif text-xl text-ink'}>{value}</div>
    </Card>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="card-surface flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-raised text-clay">
        <Target className="size-7" />
      </div>
      <div>
        <h3 className="font-serif text-xl text-ink">No goals yet</h3>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
          Name something worth money — a trip, a thing, a milestone — and rate the happiness it brings.
        </p>
      </div>
      <Button onClick={onNew}>
        <Plus className="size-4" />
        Add your first goal
      </Button>
    </div>
  )
}

export default function GoalsPage() {
  const goals = useGoals()
  const goalGroups = useGoalGroups()
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const setGoalStatus = useStore((s) => s.setGoalStatus)
  const boxes = useActiveBoxes()
  const groupById = useMemo(() => new Map(goalGroups.map((g) => [g.id, g])), [goalGroups])

  const now = useViewDate()
  const horizon = addMonthsISO(now, HORIZON_MONTHS)
  const halfLifeMonths = settings.happinessHalfLifeMonths ?? 24
  const opts: HappinessOptions = useMemo(
    () => ({ now, horizon, halfLifeMonths }),
    [now, horizon, halfLifeMonths],
  )

  // The budget isn't typed in — it's the live value of the goal-funding pool.
  // Flip "Funds goals" on a box and it joins the pool the planner spends from.
  const budget = useGoalBudget()
  const funding = useGoalFundingBoxes()
  const boxById = useMemo(() => new Map(boxes.map((b) => [b.id, b])), [boxes])

  const plan = useScheduledPlan(opts)
  const banked = useBankedHappiness(opts)
  const scheduledById = useMemo(
    () => new Map(plan.scheduled.map((s) => [s.goal.id, s])),
    [plan],
  )
  const droppedById = useMemo(
    () => new Map(plan.dropped.map((d) => [d.goal.id, d])),
    [plan],
  )
  // The active multiplier field for card worths: done umbrellas (from their
  // achieved date) plus the plan's scheduled umbrellas (from when it lands).
  const cardUmbrellas = useMemo(
    () =>
      umbrellaSources(goals, opts, (g) =>
        g.status === 'done' && g.doneDate ? g.doneDate : (scheduledById.get(g.id)?.achieveDate ?? null),
      ),
    [goals, opts, scheduledById],
  )
  // "Now" if achieved today, else the month it lands in.
  const whenLabel = (achieveDate: string) => (achieveDate <= now ? 'Now' : fmtMonthYear(achieveDate))

  // A goal's card worth + status badge — shared by standalone cards and stacks.
  const cardOf = (g: Goal) => {
    const achieveDate = g.status === 'done' && g.doneDate ? g.doneDate : now
    const happiness = goalHappiness(g, achieveDate, opts, cardUmbrellas)
    const scheduled = scheduledById.get(g.id)
    const dropped = droppedById.get(g.id)
    const badge =
      g.status === 'open' ? (
        scheduled ? (
          <Chip className="gap-1 border-sage/40 text-sage">
            <Sparkles className="size-3" />
            {whenLabel(scheduled.achieveDate)}
            {scheduled.until && ` · upgrades ${whenLabel(scheduled.until)}`}
          </Chip>
        ) : dropped?.reason === 'alternative' ? (
          <Chip className="text-faint">Alternative</Chip>
        ) : (
          <Chip className="text-faint">Won’t fit</Chip>
        )
      ) : undefined
    return { happiness, badge }
  }

  const [chartMode, setChartMode] = useState<'banked' | 'plan'>('plan')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | undefined>(undefined)
  const openNew = () => {
    setEditing(undefined)
    setEditorOpen(true)
  }
  const openEdit = (g: Goal) => {
    setEditing(g)
    setEditorOpen(true)
  }

  // Deep link from elsewhere (e.g. an achieved-goal row in the activity feed):
  // `/goals?edit=<id>` opens that goal's editor, then the param is consumed so
  // closing the editor doesn't immediately reopen it.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const id = searchParams.get('edit')
    if (!id) return
    const g = goals.find((x) => x.id === id)
    if (g) openEdit(g)
    searchParams.delete('edit')
    setSearchParams(searchParams, { replace: true })
  }, [searchParams, goals, setSearchParams])

  // tracks for the happiness chart: achieved goals, plus (optionally) the plan
  const tracks = useMemo<HappinessTrack[]>(() => {
    const done: HappinessTrack[] = goals
      .filter((g) => g.status === 'done' && g.doneDate)
      .map((g) => ({ id: g.id, name: g.name, color: g.color, achieveDate: g.doneDate!, value: g.value, umbrella: g.umbrella }))
    if (chartMode === 'banked') return done
    const planned: HappinessTrack[] = plan.scheduled.map((s) => ({
      id: s.goal.id,
      name: s.goal.name,
      color: s.goal.color,
      achieveDate: s.achieveDate,
      value: s.goal.value,
      umbrella: s.goal.umbrella,
      planned: true,
    }))
    return [...done, ...planned]
  }, [goals, plan, chartMode])

  const openCount = goals.filter((g) => g.status === 'open').length
  const maxDensity = Math.max(
    0,
    ...[...plan.scheduled, ...plan.dropped].map((s) => (Number.isFinite(s.density) ? s.density : 0)),
  )

  if (goals.length === 0) {
    return (
      <Page>
        <PageHeader title="Goals" subtitle="Turn money into happiness — and spend it where it counts most." />
        <EmptyState onNew={openNew} />
        <GoalEditor key="new" open={editorOpen} onOpenChange={setEditorOpen} goal={editing} />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title="Goals"
        subtitle="Turn money into happiness — and spend it where it counts most."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            New goal
          </Button>
        }
      />

      {/* budget (from the boxes funding goals) + weighting */}
      <Card className="p-4 md:p-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-faint">Spendable budget</span>
            <div className="font-serif text-2xl text-ink">
              <Money amount={budget} />
            </div>
            {funding.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-faint">from</span>
                {funding.map((f) => {
                  const box = boxById.get(f.boxId)
                  if (!box) return null
                  return (
                    <Chip key={f.boxId} dot={box.color}>
                      {box.name} · <Money amount={f.base} compact className="text-muted" />
                    </Chip>
                  )
                })}
              </div>
            ) : (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-faint">
                <Wallet className="size-3.5" />
                No boxes fund goals yet — turn on “Funds goals” for a box to build the budget.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-faint">Near-term focus</span>
            <Segmented
              value={String(halfLifeMonths)}
              onChange={(v) => updateSettings({ happinessHalfLifeMonths: Number(v) })}
              options={HALF_LIFE_PRESETS}
              size="sm"
            />
            <p className="text-xs text-faint">Worth halves every {halfLifeMonths} months further out.</p>
          </div>
        </div>
      </Card>

      {/* summary */}
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Banked" value={<span className="tabular">{banked.toFixed(0)}</span>} accent />
        <Stat label="Plan unlocks" value={<span className="tabular">+{plan.happiness.toFixed(0)}</span>} accent />
        <Stat label="Plan spend" value={<Money amount={plan.spend} compact />} />
        <Stat label="Open goals" value={<span className="tabular">{openCount}</span>} />
      </div>

      {/* the plan */}
      <Card className="mt-4 p-4 md:p-5">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-ink">Best plan</h2>
          <span className="text-xs text-faint">
            within <Money amount={budget} compact /> · waits when the pot can grow into more
          </span>
        </div>

        {plan.scheduled.length === 0 && plan.dropped.length === 0 ? (
          <p className="py-4 text-sm text-faint">No open goals to plan. Add one, or reopen a shelved goal.</p>
        ) : (
          <div className="mt-3 flex flex-col">
            {plan.scheduled.map((s, i) => (
              <PlanRow
                key={s.goal.id}
                rank={i + 1}
                goal={s.goal}
                cost={s.cost}
                happiness={s.happiness}
                density={s.density}
                maxDensity={maxDensity}
                when={whenLabel(s.achieveDate)}
                upgradeFromName={
                  s.upgradeFrom ? plan.scheduled.find((x) => x.goal.id === s.upgradeFrom)?.goal.name : undefined
                }
                upgradesAt={s.until ? whenLabel(s.until) : undefined}
                onAchieve={() => setGoalStatus(s.goal.id, 'done')}
              />
            ))}
            {plan.dropped.length > 0 && (
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-2 text-[11px] uppercase tracking-[0.1em] text-faint">Not in the plan</div>
                {plan.dropped.map((s) => (
                  <PlanRow
                    key={s.goal.id}
                    goal={s.goal}
                    cost={s.cost}
                    happiness={s.happiness}
                    density={s.density}
                    maxDensity={maxDensity}
                    note={
                      s.reason === 'not-worth-it'
                        ? 'no happiness'
                        : s.reason === 'alternative'
                          ? 'not chosen'
                          : 'over budget'
                    }
                    dimmed
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* happiness over time */}
      <Card className="mt-4 p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted">Happiness over time</h2>
          <Segmented
            value={chartMode}
            onChange={setChartMode}
            options={[
              { value: 'banked', label: 'Achieved' },
              { value: 'plan', label: 'With plan' },
            ]}
            size="sm"
          />
        </div>

        {tracks.length === 0 ? (
          <div className="grid h-[220px] place-items-center text-sm text-faint md:h-[280px]">
            {chartMode === 'banked' ? 'Nothing achieved yet.' : 'The plan is empty — mark a box “Funds goals”, or add goals.'}
          </div>
        ) : (
          <HappinessChart tracks={tracks} now={now} horizon={horizon} halfLifeMonths={halfLifeMonths} />
        )}

        <p className="mt-2 text-xs text-faint">
          The filled area is total happiness — achieving sooner makes it wider. Dashed bands are the recommended plan.
        </p>
      </Card>

      {/* the goals themselves, grouped by where they are in life */}
      {STATUS_ORDER.map((status) => {
        const group = goals.filter((g) => g.status === status)
        if (group.length === 0) return null
        const meta = STATUS_META[status]
        return (
          <section key={status} className="mt-8">
            <div className="mb-3 flex items-center gap-2">
              <meta.icon className={`size-4 ${meta.tone}`} />
              <h2 className="font-serif text-xl text-ink">{meta.label}</h2>
              <span className="text-sm text-faint">{group.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {(() => {
                // Render one cell per goal — but collapse same-group alternatives
                // into a single fanning stack (placed where the first member sits).
                const seenGroups = new Set<string>()
                const cells: React.ReactNode[] = []
                group.forEach((g, i) => {
                  const entrance = {
                    initial: { opacity: 0, y: 12 },
                    animate: { opacity: 1, y: 0 },
                    transition: { duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] as const },
                  }
                  if (g.groupId) {
                    if (seenGroups.has(g.groupId)) return
                    seenGroups.add(g.groupId)
                    const members = group
                      .filter((m) => m.groupId === g.groupId)
                      .map((m) => ({ goal: m, ...cardOf(m) }))
                      // primary on top: the planner's pick first, then by worth
                      .sort(
                        (a, b) =>
                          Number(scheduledById.has(b.goal.id)) - Number(scheduledById.has(a.goal.id)) ||
                          b.happiness - a.happiness,
                      )
                    cells.push(
                      <GoalStack
                        key={`grp-${g.groupId}`}
                        group={groupById.get(g.groupId)}
                        halfLifeMonths={halfLifeMonths}
                        items={members}
                        onEdit={openEdit}
                        entranceDelay={i * 0.04}
                      />,
                    )
                  } else {
                    const { happiness, badge } = cardOf(g)
                    cells.push(
                      <motion.div key={g.id} className="h-full" {...entrance}>
                        <GoalCard goal={g} halfLifeMonths={halfLifeMonths} happiness={happiness} badge={badge} onEdit={() => openEdit(g)} />
                      </motion.div>,
                    )
                  }
                })
                return cells
              })()}
            </div>
          </section>
        )
      })}

      <GoalEditor key={editing?.id ?? 'new'} open={editorOpen} onOpenChange={setEditorOpen} goal={editing} onNavigate={setEditing} />
    </Page>
  )
}

function PlanRow({
  rank,
  goal,
  cost,
  happiness,
  density,
  maxDensity,
  when,
  note,
  upgradeFromName,
  upgradesAt,
  dimmed,
  onAchieve,
}: {
  rank?: number
  goal: Goal
  cost: number
  happiness: number
  density: number
  maxDensity: number
  /** when the plan achieves it, e.g. "Now" or "Mar 2027" */
  when?: string
  /** why a dropped goal didn't make the cut */
  note?: string
  /** the cheaper goal this one upgrades from (set on the upgrade target) */
  upgradeFromName?: string
  /** when this goal is itself replaced by an upgrade (set on the cheaper half) */
  upgradesAt?: string
  dimmed?: boolean
  onAchieve?: () => void
}) {
  const width = maxDensity > 0 && Number.isFinite(density) ? Math.max(4, (density / maxDensity) * 100) : 100
  return (
    <div className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-raised/50 ${dimmed ? 'opacity-55' : ''}`}>
      <div className="grid size-6 shrink-0 place-items-center rounded-md bg-sunken/60 text-xs tabular text-faint">
        {rank ?? '–'}
      </div>
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: goal.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm text-ink">{goal.name}</span>
            {upgradeFromName && (
              <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-clay/15 px-1.5 py-0.5 text-[10px] font-medium text-clay">
                <ArrowUp className="size-2.5" />
                from {upgradeFromName}
              </span>
            )}
            {when && (
              <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${when === 'Now' ? 'bg-sage/15 text-sage' : 'bg-raised text-muted'}`}>
                {when}
              </span>
            )}
            {upgradesAt && (
              <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-faint">→ upgrades {upgradesAt}</span>
            )}
            {note && <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-faint">{note}</span>}
          </div>
          <span className="shrink-0 text-xs tabular text-faint">
            <Money amount={cost} compact />
          </span>
        </div>
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: goal.color }} />
        </div>
      </div>
      <div className="flex w-14 shrink-0 items-center justify-end gap-1 text-sm text-sage">
        <Sparkles className="size-3.5" />
        <span className="tabular">{happiness.toFixed(0)}</span>
      </div>
      {onAchieve && (
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={onAchieve}
        >
          Achieve
        </Button>
      )}
    </div>
  )
}
