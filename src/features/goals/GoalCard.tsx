import { MoreHorizontal, Pencil, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { RatingCurve, distanceWeight, type Goal } from '@/domain'
import { cn } from '@/lib/cn'
import { fmtDate, todayISO } from '@/lib/date'
import { hexToRgba } from '@/lib/palette'
import { useActiveBoxes } from '@/store/selectors'
import { useStore } from '@/store/store'
import { Button, Card, Chip, ConfirmDialog, Menu, MenuItem, Money, Sparkline } from '@/ui'
import { MAX_RATING, STATUS_META } from './goal-meta'

function ratingSeries(goal: Goal, halfLifeMonths: number): number[] {
  const curve = new RatingCurve(goal.value, todayISO())
  return Array.from({ length: 25 }, (_, m) => {
    const years = m / 12
    return curve.rateAt(years) * distanceWeight(years, halfLifeMonths)
  })
}

export function GoalCard({
  goal,
  halfLifeMonths,
  happiness,
  badge,
  onEdit,
}: {
  goal: Goal
  halfLifeMonths: number
  happiness: number
  badge?: ReactNode
  onEdit: () => void
}) {
  const setGoalStatus = useStore((s) => s.setGoalStatus)
  const removeGoal = useStore((s) => s.removeGoal)
  const boxes = useActiveBoxes()
  const [confirm, setConfirm] = useState(false)

  const meta = STATUS_META[goal.status]
  const StatusIcon = meta.icon
  const funding = goal.boxIds.map((id) => boxes.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => !!b)
  const ratingLabel = goal.value.type === 'flat' ? `${goal.value.rating}` : 'varies'
  const dimmed = goal.status === 'dismissed'

  return (
    <>
      <Card
        interactive
        onClick={onEdit}
        className={cn('relative flex h-full flex-col gap-3 overflow-hidden p-5', dimmed && 'opacity-65')}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full blur-2xl"
          style={{ background: hexToRgba(goal.color, 0.16) }}
        />

        <header className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="grid size-10 shrink-0 place-items-center rounded-xl font-serif text-lg"
              style={{ backgroundColor: hexToRgba(goal.color, 0.14), color: goal.color }}
            >
              {goal.value.type === 'flat' ? goal.value.rating : '~'}
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate font-medium text-ink">{goal.name}</div>
              <div className="flex items-center gap-1 text-xs text-faint">
                <StatusIcon className={cn('size-3', meta.tone)} />
                {goal.status === 'done' && goal.doneDate ? fmtDate(goal.doneDate) : meta.label}
              </div>
            </div>
          </div>

          <Menu
            trigger={
              <Button size="icon" variant="ghost" aria-label="Goal options" className="size-8 shrink-0" onClick={(e) => e.stopPropagation()}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          >
            <MenuItem icon={Pencil} onSelect={onEdit}>
              Edit
            </MenuItem>
            {goal.status !== 'done' && (
              <MenuItem icon={Sparkles} onSelect={() => setGoalStatus(goal.id, 'done')}>
                Mark achieved
              </MenuItem>
            )}
            {goal.status !== 'open' && (
              <MenuItem icon={RotateCcw} onSelect={() => setGoalStatus(goal.id, 'open')}>
                Reopen
              </MenuItem>
            )}
            {goal.status !== 'dismissed' && (
              <MenuItem icon={RotateCcw} onSelect={() => setGoalStatus(goal.id, 'dismissed')}>
                Shelve
              </MenuItem>
            )}
            <MenuItem icon={Trash2} danger onSelect={() => setConfirm(true)}>
              Delete
            </MenuItem>
          </Menu>
        </header>

        <div className="flex items-end justify-between gap-2">
          <Money amount={goal.cost} compact className="font-serif text-[1.55rem] leading-none text-ink" />
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-sm text-sage">
              <Sparkles className="size-3.5" />
              <span className="tabular">{happiness.toFixed(0)}</span>
            </div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-faint">happiness</div>
          </div>
        </div>

        <Sparkline data={ratingSeries(goal, halfLifeMonths)} color={goal.color} width={320} height={32} className="w-full" />

        <div className="mt-auto flex min-h-[1.625rem] flex-wrap items-center gap-1.5">
          {badge}
          <Chip className="gap-1">
            {ratingLabel === 'varies' ? 'rating varies' : `rated ${ratingLabel}/${MAX_RATING}`}
          </Chip>
          {funding.map((b) => (
            <Chip key={b.id} dot={b.color}>
              {b.name}
            </Chip>
          ))}
        </div>
      </Card>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete "${goal.name}"?`}
        description="This removes the goal for good. Achieved goals are usually worth shelving instead."
        confirmLabel="Delete goal"
        danger
        onConfirm={() => removeGoal(goal.id)}
      />
    </>
  )
}
