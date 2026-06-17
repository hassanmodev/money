/**
 * Editing a goal's worth: a steady rating, or a curve that shifts over time.
 * The preview sparkline is the very thing the planner integrates.
 */
import { Plus, Trash2 } from 'lucide-react'
import { sampleRating, type GoalValue, type ValuePoint } from '@/domain'
import { addYearsISO, todayISO } from '@/lib/date'
import { cn } from '@/lib/cn'
import { Button, Input, Segmented, Slider, Sparkline } from '@/ui'
import { RATING_MAX, fmtRating, isCurveValue } from './helpers'

const byDate = (a: ValuePoint, b: ValuePoint) => a.date.localeCompare(b.date)

/** How far the preview should reach: a year past the furthest breakpoint. */
function previewMonths(value: GoalValue): number {
  if (!isCurveValue(value) || !value.length) return 60
  const today = todayISO()
  const maxYears = Math.max(
    ...value.map((p) => (new Date(p.date).getTime() - new Date(today).getTime()) / (365.25 * 864e5)),
  )
  return Math.min(360, Math.max(36, Math.round(maxYears * 12) + 12))
}

export function GoalValueEditor({
  value,
  onChange,
  color,
}: {
  value: GoalValue
  onChange: (v: GoalValue) => void
  color: string
}) {
  const curve = isCurveValue(value)
  const steady = curve ? (value[0]?.value ?? 5) : value
  const points = curve ? [...value].sort(byDate) : []

  const setMode = (m: string) => {
    if (m === 'steady' && curve) {
      onChange(points[0]?.value ?? 5)
    } else if (m === 'curve' && !curve) {
      const today = todayISO()
      onChange([
        { date: today, value: steady },
        { date: addYearsISO(today, 3), value: Math.max(0, Math.round(steady - 3)) },
      ])
    }
  }

  const setPoint = (i: number, patch: Partial<ValuePoint>) =>
    onChange(points.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const addPoint = () => {
    const last = points[points.length - 1]
    onChange([
      ...points,
      { date: addYearsISO(last?.date ?? todayISO(), 1), value: Math.max(0, (last?.value ?? 3) - 1) },
    ])
  }

  const removePoint = (i: number) => {
    const next = points.filter((_, j) => j !== i)
    onChange(next.length ? next : steady) // never leave an empty curve
  }

  const preview = sampleRating(value, todayISO(), previewMonths(value), 48)

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        value={curve ? 'curve' : 'steady'}
        onChange={setMode}
        options={[
          { value: 'steady', label: 'Steady' },
          { value: 'curve', label: 'Over time' },
        ]}
        size="sm"
      />

      {!curve ? (
        <div className="flex items-center gap-4">
          <Slider
            aria-label="Rating"
            value={steady}
            min={0}
            max={RATING_MAX}
            step={0.5}
            onValueChange={(n) => onChange(n)}
            className="max-w-xs"
          />
          <span className="tabular font-serif text-xl text-ink">{fmtRating(steady)}</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {points.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <Input
                type="date"
                value={p.date}
                onChange={(e) => setPoint(i, { date: e.target.value })}
                className="h-10 flex-1 [color-scheme:dark]"
              />
              <div className="flex w-40 items-center gap-2">
                <Slider
                  aria-label={`Rating from ${p.date}`}
                  value={p.value}
                  min={0}
                  max={RATING_MAX}
                  step={0.5}
                  onValueChange={(n) => setPoint(i, { value: n })}
                />
                <span className="tabular w-6 text-right text-sm text-ink">{fmtRating(p.value)}</span>
              </div>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remove point"
                className={cn('size-9 shrink-0', points.length <= 1 && 'pointer-events-none opacity-30')}
                onClick={() => removePoint(i)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={addPoint} className="self-start">
            <Plus className="size-4" />
            Add a turning point
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-line bg-sunken/30 px-3 pt-2">
        <div className="text-[10px] uppercase tracking-[0.1em] text-faint">Worth over time</div>
        <Sparkline data={preview} color={color} width={320} height={44} className="w-full" />
      </div>
    </div>
  )
}
