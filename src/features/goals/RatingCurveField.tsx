import { Plus, X } from 'lucide-react'
import { RatingCurve, distanceWeight, type GoalValue } from '@/domain'
import { addMonthsISO, todayISO } from '@/lib/date'
import { Button, Segmented, Slider, Sparkline } from '@/ui'
import { MAX_RATING } from './goal-meta'

const firstRating = (v: GoalValue): number =>
  v.type === 'flat' ? v.rating : (v.points[0]?.rating ?? 5)

/** A tiny twin sparkline: your rating, and what distance leaves of it. */
function CurvePreview({
  value,
  halfLifeMonths,
  color,
}: {
  value: GoalValue
  halfLifeMonths: number
  color: string
}) {
  const now = todayISO()
  const curve = new RatingCurve(value, now)
  const months = 30
  const raw: number[] = []
  const weighted: number[] = []
  for (let m = 0; m <= months; m++) {
    const years = m / 12
    const r = curve.rateAt(years)
    raw.push(r)
    weighted.push(r * distanceWeight(years, halfLifeMonths))
  }
  return (
    <div className="relative h-14 w-full overflow-hidden rounded-lg border border-line bg-sunken/30">
      {/* the raw rating, faint behind */}
      <div className="absolute inset-0 opacity-35">
        <Sparkline data={raw} color={color} width={520} height={56} fill={false} strokeWidth={1.25} className="h-full w-full" />
      </div>
      {/* the discounted rating, filled */}
      <Sparkline data={weighted} color={color} width={520} height={56} className="relative h-full w-full" />
    </div>
  )
}

/**
 * Rate a goal: one number forever, or a step curve across dates. The preview
 * shows your rating (faint) and what the distance discount leaves of it (filled)
 * — sooner counts more.
 */
export function RatingCurveField({
  value,
  onChange,
  halfLifeMonths,
  color,
}: {
  value: GoalValue
  onChange: (v: GoalValue) => void
  halfLifeMonths: number
  color: string
}) {
  const setFlat = () => onChange({ type: 'flat', rating: firstRating(value) })
  const setPeriods = () => {
    if (value.type === 'periods') return
    onChange({
      type: 'periods',
      points: [
        { from: todayISO(), rating: value.rating },
        { from: addMonthsISO(todayISO(), 6), rating: Math.max(0, value.rating - 3) },
      ],
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Segmented
        value={value.type}
        onChange={(t) => (t === 'flat' ? setFlat() : setPeriods())}
        options={[
          { value: 'flat', label: 'Steady' },
          { value: 'periods', label: 'Over time' },
        ]}
        size="sm"
      />

      {value.type === 'flat' ? (
        <div className="flex items-center gap-4 rounded-xl border border-line bg-sunken/30 px-4 py-3">
          <Slider
            value={value.rating}
            onValueChange={(r) => onChange({ type: 'flat', rating: r })}
            min={0}
            max={MAX_RATING}
            step={0.5}
            aria-label="Rating"
            className="flex-1"
          />
          <span className="w-10 text-right font-serif text-lg tabular text-ink">
            {value.rating.toFixed(1).replace(/\.0$/, '')}
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {value.points.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-xl border border-line bg-sunken/30 px-3 py-2">
              <input
                type="date"
                value={p.from}
                onChange={(e) => {
                  const points = value.points.map((q, j) => (j === i ? { ...q, from: e.target.value } : q))
                  onChange({ type: 'periods', points })
                }}
                className="h-9 w-[8.5rem] rounded-lg border border-line bg-sunken/40 px-2 text-sm text-ink outline-none [color-scheme:dark] focus:border-clay/50"
              />
              <Slider
                value={p.rating}
                onValueChange={(r) => {
                  const points = value.points.map((q, j) => (j === i ? { ...q, rating: r } : q))
                  onChange({ type: 'periods', points })
                }}
                min={0}
                max={MAX_RATING}
                step={0.5}
                aria-label="Rating for this period"
                className="flex-1"
              />
              <span className="w-7 text-right text-sm tabular text-muted">
                {p.rating.toFixed(1).replace(/\.0$/, '')}
              </span>
              <button
                type="button"
                aria-label="Remove period"
                onClick={() => {
                  const points = value.points.filter((_, j) => j !== i)
                  onChange({ type: 'periods', points: points.length ? points : [{ from: todayISO(), rating: 5 }] })
                }}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-rust/10 hover:text-rust"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => {
              const last = value.points.at(-1)
              const from = last ? addMonthsISO(last.from, 6) : todayISO()
              onChange({ type: 'periods', points: [...value.points, { from, rating: last?.rating ?? 5 }] })
            }}
          >
            <Plus className="size-4" />
            Add period
          </Button>
        </div>
      )}

      <CurvePreview value={value} halfLifeMonths={halfLifeMonths} color={color} />
    </div>
  )
}
