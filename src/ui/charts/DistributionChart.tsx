import { arc, pie } from 'd3-shape'
import { useId, useState } from 'react'
import { PieChartModel, type ChartPoint } from '@/lib/charts/ChartDataset'
import { cn } from '@/lib/cn'

export interface DistributionChartProps {
  points: readonly ChartPoint[]
  label: string
  formatValue: (value: number) => string
  /** Zero gives a pie; a fraction between 0 and 1 gives a doughnut. */
  innerRadius?: number
  emptyMessage?: string
}

const percent = (share: number) => new Intl.NumberFormat(undefined, {
  style: 'percent', maximumFractionDigits: 1,
}).format(share)

/** No finance/store dependencies: supply points and a formatter for any measure. */
export function DistributionChart({
  points, label, formatValue, innerRadius = 0.72,
  emptyMessage = 'No positive values to chart',
}: DistributionChartProps) {
  const titleId = useId()
  const [activeId, setActiveId] = useState<string | null>(null)
  const model = new PieChartModel(points)
  const active = model.points.find((point) => point.id === activeId)
  const arcs = pie<ChartPoint>().sort(null).value((point) => point.value ?? 0)([...model.slices])
  const radius = Math.min(0.9, Math.max(0, innerRadius)) * 96
  const path = arc<(typeof arcs)[number]>().innerRadius(radius).outerRadius(96).cornerRadius(2)
  const describe = (point: ChartPoint) => point.value === null
    ? 'Unavailable'
    : `${formatValue(point.value)} · ${percent(model.share(point))}`

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
      <div className="relative mx-auto size-[200px]">
        <svg viewBox="-104 -104 208 208" role="img" aria-labelledby={titleId} className="size-full">
          <title id={titleId}>{label}. {model.total > 0 ? `Positive total: ${formatValue(model.total)}` : emptyMessage}</title>
          <circle r="96" fill="var(--color-raised)" />
          {arcs.map((slice) => (
            <path
              key={slice.data.id}
              d={path(slice) ?? ''}
              fill={slice.data.color}
              stroke="var(--color-surface)"
              strokeWidth="2"
              opacity={active && active.id !== slice.data.id ? 0.35 : 1}
              className="transition-opacity"
              onPointerEnter={() => setActiveId(slice.data.id)}
              onPointerLeave={() => setActiveId(null)}
            >
              <title>{slice.data.label}: {describe(slice.data)}</title>
            </path>
          ))}
          {radius > 0 && <circle r={radius} fill="var(--color-surface)" />}
        </svg>
        {radius >= 55 && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-9 text-center">
            <span className="max-w-full truncate text-xs text-muted">{active?.label ?? 'Positive total'}</span>
            <span className="mt-1 max-w-full break-words font-serif text-lg tabular text-ink">
              {active ? active.value === null ? 'Unavailable' : formatValue(active.value) : formatValue(model.total)}
            </span>
          </div>
        )}
      </div>
      <div className="min-w-0">
        {model.total === 0 && <p className="mb-3 text-sm text-muted">{emptyMessage}</p>}
        <ul className="space-y-1" aria-label={`${label} values`}>
          {model.points.map((point) => (
            <li key={point.id}>
              <div
                tabIndex={0}
                className={cn('flex items-start gap-2.5 rounded-lg p-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-clay', activeId === point.id && 'bg-raised')}
                onPointerEnter={() => setActiveId(point.id)}
                onPointerLeave={() => setActiveId(null)}
                onFocus={() => setActiveId(point.id)}
                onBlur={() => setActiveId(null)}
              >
                <span aria-hidden="true" className="mt-1 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: point.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm text-ink">{point.label}</span>
                  {point.detail && <span className="block text-xs text-faint">{point.detail}</span>}
                </span>
                <span className="min-w-0 max-w-[55%] break-words text-right tabular">
                  <span className={cn('block text-sm', (point.value ?? 0) < 0 ? 'text-rust' : 'text-ink')}>
                    {point.value === null ? 'Unavailable' : formatValue(point.value)}
                  </span>
                  <span className="block text-xs text-faint">{point.value === null || point.value < 0 ? 'Not in pie' : percent(model.share(point))}</span>
                </span>
              </div>
            </li>
          ))}
        </ul>
        {model.points.some((point) => point.value !== null && point.value < 0) && (
          <p className="mt-3 text-xs text-muted">Negative balances are listed but excluded from pie shares.</p>
        )}
      </div>
    </div>
  )
}
