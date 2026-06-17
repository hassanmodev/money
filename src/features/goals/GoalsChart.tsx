/**
 * Happiness banked over time — the area the plan captures as goals come within
 * reach. Each marker is a goal landing; the curve steps up by what it's worth.
 */
import { format } from 'date-fns'
import { scaleLinear, scaleTime } from 'd3-scale'
import { area as d3area, curveStepAfter, line as d3line } from 'd3-shape'
import { Flag } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { GoalPlan } from '@/domain'
import { fmtDate } from '@/lib/date'
import { useElementWidth, useIsMobile } from '@/lib/hooks'
import { hexToRgba } from '@/lib/palette'
import { fmtHappiness } from './helpers'

const ACCENT = '#d4845c'

export function GoalsChart({ plan }: { plan: GoalPlan }) {
  const { ref, width } = useElementWidth()
  const mobile = useIsMobile()
  const gid = useId().replace(/:/g, '')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const C = plan.curve
  const H = mobile ? 220 : 280
  const padL = 12
  const padR = 14
  const padT = 18
  const padB = 26

  if (width < 2 || C.length < 2) {
    return <div ref={ref} className="h-[220px] w-full md:h-[280px]" />
  }

  const n = C.length
  const idx = C.map((_, i) => i)
  const x = scaleTime()
    .domain([C[0].t, C[n - 1].t])
    .range([padL, width - padR])
  const yMax = Math.max(plan.totalCaptured, ...C.map((p) => p.cumulative)) * 1.12 || 1
  const y = scaleLinear().domain([0, yMax]).range([H - padB, padT])

  const areaGen = d3area<number>()
    .x((i) => x(C[i].t))
    .y0(y(0))
    .y1((i) => y(C[i].cumulative))
    .curve(curveStepAfter)
  const lineGen = d3line<number>()
    .x((i) => x(C[i].t))
    .y((i) => y(C[i].cumulative))
    .curve(curveStepAfter)

  const yTicks = y.ticks(4)
  const spanYears = (C[n - 1].t - C[0].t) / (365.25 * 864e5)
  const xTicks = x.ticks(Math.min(6, Math.max(3, Math.round(spanYears))))
  const xFmt = spanYears <= 2.5 ? "MMM ''yy" : 'yyyy'

  // reached goals, placed at the cumulative height just after they land
  const markers = plan.items
    .filter((it) => it.reachDate)
    .map((it) => {
      const ci = C.findIndex((p) => p.date >= it.reachDate!)
      const cum = ci >= 0 ? C[ci].cumulative : plan.totalCaptured
      return { it, mx: x(new Date(it.reachDate!).getTime()), my: y(cum) }
    })

  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const t = Math.max(0, Math.min(1, (e.clientX - rect.left - padL) / (width - padL - padR)))
    setHover(Math.round(t * (n - 1)))
  }

  const hi = hover ?? n - 1
  const hx = x(C[hi].t)

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg
        ref={svgRef}
        width={width}
        height={H}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="touch-none"
      >
        <defs>
          <linearGradient id={`goals-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hexToRgba(ACCENT, 0.5)} />
            <stop offset="100%" stopColor={hexToRgba(ACCENT, 0.04)} />
          </linearGradient>
        </defs>

        {yTicks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={width - padR}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-line)"
              strokeWidth={1}
              strokeDasharray="2 5"
            />
            <text x={padL} y={y(t) - 4} fill="var(--color-faint)" fontSize={10} className="tabular">
              {fmtHappiness(t)}
            </text>
          </g>
        ))}

        {xTicks.map((d) => (
          <text key={+d} x={x(d)} y={H - 8} fill="var(--color-faint)" fontSize={10} textAnchor="middle">
            {format(d, xFmt)}
          </text>
        ))}

        <path d={areaGen(idx) ?? ''} fill={`url(#goals-${gid})`} />
        <path
          d={lineGen(idx) ?? ''}
          fill="none"
          stroke={ACCENT}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {markers.map(({ it, mx, my }) => (
          <g key={it.goal.id}>
            <line
              x1={mx}
              x2={mx}
              y1={my}
              y2={H - padB}
              stroke={it.goal.color ?? ACCENT}
              strokeWidth={1}
              strokeDasharray="2 4"
              opacity={0.55}
            />
            <circle cx={mx} cy={my} r={3.5} fill={it.goal.color ?? ACCENT} stroke="var(--color-canvas)" strokeWidth={1.5} />
          </g>
        ))}

        <line x1={hx} x2={hx} y1={padT} y2={H - padB} stroke="var(--color-clay)" strokeWidth={1} opacity={hover === null ? 0 : 0.7} />
        <circle cx={hx} cy={y(C[hi].cumulative)} r={4} fill="var(--color-clay)" stroke="var(--color-canvas)" strokeWidth={2} />
      </svg>

      {/* marker labels */}
      {markers.map(({ it, mx, my }) => (
        <div
          key={it.goal.id}
          className="pointer-events-none absolute flex items-center gap-1 text-[10px]"
          style={{ left: Math.min(width - 80, mx + 5), top: my - 16, color: it.goal.color ?? ACCENT }}
        >
          <Flag className="size-2.5" />
          <span className="max-w-[88px] truncate">{it.goal.label}</span>
        </div>
      ))}

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-1 rounded-xl border border-line bg-raised/95 px-2.5 py-1.5 text-xs shadow-soft backdrop-blur-sm"
          style={{ left: Math.max(8, Math.min(width - 140, hx - 60)) }}
        >
          <span className="text-faint">{fmtDate(C[hi].date)} · </span>
          <span className="tabular font-medium text-ink">{fmtHappiness(C[hi].cumulative)} joy</span>
        </div>
      )}
    </div>
  )
}
