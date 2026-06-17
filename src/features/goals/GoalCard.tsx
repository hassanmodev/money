import { CalendarClock, CheckCircle2, MoreHorizontal, Pencil, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { currencyMeta, sampleRating, type Box, type GoalPlanItem } from '@/domain'
import { fmtDate, todayISO } from '@/lib/date'
import { hexToRgba } from '@/lib/palette'
import { horizonLabel } from '@/features/planning/horizon'
import { useStore } from '@/store/store'
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  Menu,
  MenuItem,
  Money,
  Sparkline,
  useBaseCurrency,
} from '@/ui'
import { boxIcon } from '@/ui/icons'
import { fmtHappiness, summarizeValue } from './helpers'

/** A thin captured-vs-potential meter. */
function JoyBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${Math.round(ratio * 100)}%`, backgroundColor: color }}
      />
    </div>
  )
}

export function GoalCard({
  item,
  rank,
  boxes,
  onEdit,
}: {
  item: GoalPlanItem
  rank: number
  boxes: Box[]
  onEdit: () => void
}) {
  const { goal } = item
  const updateGoal = useStore((s) => s.updateGoal)
  const removeGoal = useStore((s) => s.removeGoal)
  const base = useBaseCurrency()
  const [confirm, setConfirm] = useState(false)

  const color = goal.color ?? '#d4845c'
  const funders = goal.boxIds
    .map((id) => boxes.find((b) => b.id === id))
    .filter((b): b is Box => !!b)
  const series = sampleRating(goal.value, todayISO(), 60, 36)
  const joyRatio = item.potential > 0 ? item.captured / item.potential : 0
  const perK = goal.cost > 0 ? item.density * 1000 : null

  return (
    <>
      <Card className="relative flex flex-col gap-3 overflow-hidden p-5">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full blur-2xl"
          style={{ background: hexToRgba(color, 0.16) }}
        />

        <header className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              className="grid size-9 shrink-0 place-items-center rounded-xl font-serif text-sm font-medium"
              style={{ backgroundColor: hexToRgba(color, 0.16), color }}
            >
              {rank}
            </div>
            <div className="leading-tight">
              <div className="font-medium text-ink">{goal.label}</div>
              <div className="text-xs text-faint">{summarizeValue(goal.value)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Money
              amount={goal.cost}
              currency={base}
              compact
              className="font-serif text-lg text-ink"
            />
            <Menu
              trigger={
                <Button size="icon" variant="ghost" aria-label="Goal options" className="size-8 shrink-0">
                  <MoreHorizontal className="size-4" />
                </Button>
              }
            >
              <MenuItem icon={Pencil} onSelect={onEdit}>
                Edit
              </MenuItem>
              <MenuItem
                icon={CheckCircle2}
                onSelect={() => updateGoal(goal.id, { status: 'done', completedDate: todayISO() })}
              >
                Mark fulfilled
              </MenuItem>
              <MenuItem icon={Trash2} danger onSelect={() => setConfirm(true)}>
                Delete
              </MenuItem>
            </Menu>
          </div>
        </header>

        <Sparkline data={series} color={color} width={320} height={32} className="w-full" />

        {funders.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {funders.map((b) => {
              const Icon = boxIcon(b)
              return (
                <Chip key={b.id} className="gap-1" style={{ color: b.color }}>
                  <Icon className="size-3" />
                  {b.name}
                </Chip>
              )
            })}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted">
              <CalendarClock className="size-3.5 text-faint" />
              {item.reachDate ? (
                <>
                  Reach by <span className="text-ink">{fmtDate(item.reachDate)}</span>
                </>
              ) : (
                <span className="text-faint">Beyond this horizon</span>
              )}
            </span>
            {item.reachYear !== null && (
              <Chip dot={color}>in {horizonLabel(Math.max(1, Math.round(item.reachYear * 12)))}</Chip>
            )}
          </div>

          <div className="flex items-center gap-3">
            <JoyBar ratio={joyRatio} color={color} />
            <span className="tabular shrink-0 text-xs text-faint">
              {fmtHappiness(item.captured)} / {fmtHappiness(item.potential)} joy
            </span>
          </div>

          {perK !== null && (
            <div className="flex items-center gap-1.5 text-xs text-faint">
              <Sparkles className="size-3" />
              {perK.toFixed(1)} joy per {currencyMeta(base).symbol}1k spent
            </div>
          )}
        </div>
      </Card>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete "${goal.label}"?`}
        description="This removes the goal for good. To keep it for the record, mark it fulfilled instead."
        confirmLabel="Delete goal"
        danger
        onConfirm={() => removeGoal(goal.id)}
      />
    </>
  )
}
