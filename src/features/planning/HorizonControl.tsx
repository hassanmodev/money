/**
 * A month-granular horizon picker. Near-term stops are monthly so you can read
 * "within this year"; the far end thins out to decades. The slider walks the
 * stops evenly (fine where it matters), and quick chips jump to the classics.
 */
import { Slider } from '@/ui'
import { cn } from '@/lib/cn'
import { HORIZON_PRESETS, HORIZON_STOPS, horizonLabel, nearestStop } from './horizon'

export function HorizonControl({
  months,
  onChange,
}: {
  months: number
  onChange: (months: number) => void
}) {
  const idx = nearestStop(months)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-faint">Horizon</div>
          <div className="mt-0.5 font-serif text-2xl text-ink">{horizonLabel(months)}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {HORIZON_PRESETS.map((p) => {
            const active = HORIZON_STOPS[idx] === p.months
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onChange(p.months)}
                className={cn(
                  'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-clay/40 bg-clay/12 text-clay'
                    : 'border-line bg-raised/50 text-faint hover:text-muted',
                )}
              >
                {p.label}
              </button>
            )
          })}
        </div>
      </div>

      <Slider
        aria-label="Projection horizon"
        value={idx}
        min={0}
        max={HORIZON_STOPS.length - 1}
        step={1}
        onValueChange={(i) => onChange(HORIZON_STOPS[i])}
      />

      <div className="flex justify-between text-[10px] text-ghost">
        <span>3 mo</span>
        <span>1 yr</span>
        <span>5 yr</span>
        <span>30 yr</span>
      </div>
    </div>
  )
}
