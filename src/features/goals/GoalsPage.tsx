import { CheckCircle2, Plus, RotateCcw, Sparkles, Target, Trash2 } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { DEFAULT_HAPPINESS_DISCOUNT, type Goal } from '@/domain'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { fmtDate } from '@/lib/date'
import { horizonLabel } from '@/features/planning/horizon'
import { HorizonControl } from '@/features/planning/HorizonControl'
import { useActiveBoxes, useGoalPlan } from '@/store/selectors'
import { useStore } from '@/store/store'
import { Button, Card, Slider } from '@/ui'
import { GoalCard } from './GoalCard'
import { GoalEditor } from './GoalEditor'
import { GoalsChart } from './GoalsChart'
import { fmtHappiness, patienceLabel, summarizeValue } from './helpers'

function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className="mt-1 font-serif text-xl text-ink">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-faint">{hint}</div>}
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
          Name something worth saving for and how much it would mean — we'll find the order that
          buys the most happiness.
        </p>
      </div>
      <Button onClick={onNew}>
        <Plus className="size-4" />
        Create your first goal
      </Button>
    </div>
  )
}

/** A kept record of a fulfilled goal. */
function DoneRow({ goal, onEdit }: { goal: Goal; onEdit: () => void }) {
  const updateGoal = useStore((s) => s.updateGoal)
  const removeGoal = useStore((s) => s.removeGoal)
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div
        className="grid size-8 shrink-0 place-items-center rounded-lg"
        style={{ backgroundColor: `${goal.color ?? '#9eb87f'}1f`, color: goal.color ?? '#9eb87f' }}
      >
        <CheckCircle2 className="size-4" />
      </div>
      <button onClick={onEdit} className="min-w-0 flex-1 text-left">
        <div className="truncate text-sm text-ink line-through decoration-line">{goal.label}</div>
        <div className="text-xs text-faint">
          {goal.completedDate ? `Fulfilled ${fmtDate(goal.completedDate)}` : 'Fulfilled'} ·{' '}
          {summarizeValue(goal.value)}
        </div>
      </button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => updateGoal(goal.id, { status: 'open', completedDate: undefined })}
      >
        <RotateCcw className="size-3.5" />
        Reopen
      </Button>
      <Button
        size="icon"
        variant="ghost"
        aria-label="Delete goal"
        className="size-8 text-faint hover:text-rust"
        onClick={() => removeGoal(goal.id)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

export default function GoalsPage() {
  const goals = useStore((s) => s.goals)
  const updateSettings = useStore((s) => s.updateSettings)
  const discount = useStore((s) => s.settings.happinessDiscount ?? DEFAULT_HAPPINESS_DISCOUNT)
  const boxes = useActiveBoxes()

  const [months, setMonths] = useState(60)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Goal | undefined>(undefined)

  const plan = useGoalPlan(months, discount)
  const done = goals.filter((g) => g.status === 'done')

  const openNew = () => {
    setEditing(undefined)
    setEditorOpen(true)
  }
  const openEdit = (g: Goal) => {
    setEditing(g)
    setEditorOpen(true)
  }

  // soonest goal the plan actually reaches — the headline "next up"
  const nextUp = plan.items
    .filter((it) => it.reachYear !== null)
    .sort((a, b) => (a.reachYear ?? 0) - (b.reachYear ?? 0))[0]
  const efficiency = plan.totalPotential > 0 ? plan.totalCaptured / plan.totalPotential : 0

  if (goals.length === 0) {
    return (
      <Page>
        <PageHeader
          title="Goals"
          subtitle="What you're saving for — ordered to buy the most happiness your money can."
        />
        <EmptyState onNew={openNew} />
        <GoalEditor key="new" open={editorOpen} onOpenChange={setEditorOpen} goal={editing} />
      </Page>
    )
  }

  return (
    <Page>
      <PageHeader
        title="Goals"
        subtitle="Ranked by happiness per euro — each lands when your wealth covers it. Sooner counts for more."
        actions={
          <Button onClick={openNew}>
            <Plus className="size-4" />
            New goal
          </Button>
        }
      />

      {plan.items.length > 0 && (
        <>
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <Card className="p-4 md:p-5">
              <HorizonControl months={months} onChange={setMonths} />
            </Card>
            <Card className="flex flex-col justify-center gap-2 p-4 md:p-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.1em] text-faint">Patience</div>
                  <div className="mt-0.5 font-serif text-2xl text-ink first-letter:uppercase">
                    {patienceLabel(discount)}
                  </div>
                </div>
                <span className="tabular text-sm text-muted">{Math.round(discount * 100)}%/yr</span>
              </div>
              <Slider
                aria-label="Patience"
                value={discount}
                min={0}
                max={0.4}
                step={0.01}
                onValueChange={(v) => updateSettings({ happinessDiscount: v })}
              />
              <p className="text-xs text-faint">
                How much more today's happiness counts than tomorrow's.
              </p>
            </Card>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
            <Stat label="Joy banked" value={fmtHappiness(plan.totalCaptured)} hint={`over ${horizonLabel(months)}`} />
            <Stat label="In reach" value={`${plan.reachedCount} of ${plan.items.length}`} hint="goals affordable" />
            <Stat label="Of potential" value={`${Math.round(efficiency * 100)}%`} hint="captured vs ideal" />
            <Stat
              label="Next up"
              value={nextUp ? nextUp.goal.label : '—'}
              hint={nextUp?.reachDate ? fmtDate(nextUp.reachDate) : 'nothing in reach'}
            />
          </div>

          <Card className="mt-4 p-4 md:p-5">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="size-4 text-clay" />
              <h2 className="text-sm font-medium text-muted">Happiness banked over time</h2>
            </div>
            {plan.totalCaptured > 0 ? (
              <GoalsChart plan={plan} />
            ) : (
              <div className="grid h-[220px] place-items-center text-center md:h-[280px]">
                <p className="max-w-xs text-sm text-faint">
                  Nothing lands within {horizonLabel(months)}. Stretch the horizon, trim a cost, or
                  feed the funding boxes.
                </p>
              </div>
            )}
          </Card>

          <div className="mt-6 mb-3 flex items-center justify-between">
            <h2 className="font-serif text-xl text-ink">In priority order</h2>
            <span className="text-xs text-faint">best happiness per euro first</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {plan.items.map((item, i) => (
              <motion.div
                key={item.goal.id}
                className="h-full"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              >
                <GoalCard item={item} rank={i + 1} boxes={boxes} onEdit={() => openEdit(item.goal)} />
              </motion.div>
            ))}
          </div>
        </>
      )}

      {plan.items.length === 0 && done.length > 0 && (
        <Card className="flex flex-col items-center gap-3 px-6 py-12 text-center">
          <Sparkles className="size-7 text-honey" />
          <p className="text-sm text-muted">Every goal fulfilled. Dream up the next one?</p>
          <Button onClick={openNew}>
            <Plus className="size-4" />
            New goal
          </Button>
        </Card>
      )}

      {done.length > 0 && (
        <Card className="mt-6 p-5">
          <h3 className="mb-1 font-serif text-lg text-ink">Fulfilled</h3>
          <p className="mb-2 text-xs text-faint">Kept for the record — closed, never lost.</p>
          <div className="divide-y divide-line">
            {done.map((g) => (
              <DoneRow key={g.id} goal={g} onEdit={() => openEdit(g)} />
            ))}
          </div>
        </Card>
      )}

      <GoalEditor
        key={editing?.id ?? 'new'}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        goal={editing}
      />
    </Page>
  )
}
