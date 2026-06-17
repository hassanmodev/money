import { format, parseISO } from 'date-fns'
import { scaleLinear, scaleTime } from 'd3-scale'
import { area, curveMonotoneX, line } from 'd3-shape'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useRef, useState } from 'react'
import { RatingCurve, distanceWeight, type GoalValue, type ISODate } from '@/domain'
import { useElementWidth, useIsMobile } from '@/lib/hooks'
import { hexToRgba } from '@/lib/palette'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000
const morph = { type: 'spring' as const, stiffness: 130, damping: 26, mass: 0.9 }

/** One goal's happiness over time, from the day it's achieved. */
export interface HappinessTrack {
  id: string
  name: string
  color: string
  achieveDate: ISODate
  value: GoalValue
  /** recommended-but-not-yet-achieved — drawn lighter, dashed marker */
  planned?: boolean
}

/**
 * The shape of happiness over time. Each band is one goal's rating once it's
 * achieved, faded by distance; stacked, the filled area *is* the total
 * happiness. Achieving sooner widens the area — that's the whole point.
 */
export function HappinessChart({
  tracks,
  now,
  horizon,
  halfLifeMonths,
}: {
  tracks: HappinessTrack[]
  now: ISODate
  horizon: ISODate
  halfLifeMonths: number
}) {
  const { ref, width } = useElementWidth()
  const mobile = useIsMobile()
  const gid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const H = mobile ? 220 : 280
  const padL = 10
  const padR = 12
  const padT = 18
  const padB = 24
  const n = 90

  if (width < 2) return <div ref={ref} className="h-[220px] w-full md:h-[280px]" />

  const t0 = parseISO(now).getTime()
  const t1 = parseISO(horizon).getTime()
  const times = Array.from({ length: n }, (_, i) => t0 + ((t1 - t0) * i) / (n - 1))
  const yearsAt = (t: number) => (t - t0) / MS_PER_YEAR
  const idx = times.map((_, i) => i)

  // each track's discounted rate at every sample (0 before it's achieved)
  const series = tracks.map((tr) => {
    const curve = new RatingCurve(tr.value, now)
    const achY = (parseISO(tr.achieveDate).getTime() - t0) / MS_PER_YEAR
    return times.map((t) => {
      const yy = yearsAt(t)
      return yy + 1e-9 >= achY ? curve.rateAt(yy) * distanceWeight(yy, halfLifeMonths) : 0
    })
  })

  // stack the bands
  let cum = new Array(n).fill(0)
  const bands = tracks.map((tr, k) => {
    const lower = cum.slice()
    const upper = cum.map((c, i) => c + series[k][i])
    cum = upper
    return { track: tr, lower, upper }
  })
  const total = cum

  const x = scaleTime().domain([t0, t1]).range([padL, width - padR])
  const yMax = Math.max(1, ...total) * 1.12
  const y = scaleLinear().domain([0, yMax]).range([H - padB, padT])

  const mkArea = (lo: number[], hi: number[]) =>
    area<number>()
      .x((i) => x(times[i]))
      .y0((i) => y(lo[i]))
      .y1((i) => y(hi[i]))
      .curve(curveMonotoneX)(idx) ?? ''
  const mkLine = (vals: number[]) =>
    line<number>()
      .x((i) => x(times[i]))
      .y((i) => y(vals[i]))
      .curve(curveMonotoneX)(idx) ?? ''

  const spanYears = (t1 - t0) / MS_PER_YEAR
  const xTicks = x.ticks(Math.min(6, Math.max(3, Math.round(spanYears * 2))))
  const xFmt = spanYears <= 2.5 ? "MMM ''yy" : 'yyyy'

  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = e.clientX - rect.left
    const f = Math.max(0, Math.min(1, (px - padL) / (width - padL - padR)))
    setHover(Math.round(f * (n - 1)))
  }
  const hi = hover ?? -1
  const hx = hi >= 0 ? x(times[hi]) : 0
  const tipLeft = Math.max(8, Math.min(width - 188, hx - 90))

  return (
    <div ref={ref} className="relative w-full select-none">
      <svg ref={svgRef} width={width} height={H} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="touch-none">
        <defs>
          {bands.map(({ track }) => (
            <linearGradient key={track.id} id={`${gid}-${track.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hexToRgba(track.color, track.planned ? 0.32 : 0.62)} />
              <stop offset="100%" stopColor={hexToRgba(track.color, track.planned ? 0.02 : 0.06)} />
            </linearGradient>
          ))}
        </defs>

        {/* x labels */}
        {xTicks.map((d) => (
          <text key={+d} x={x(d)} y={H - 7} fill="var(--color-faint)" fontSize={10} textAnchor="middle">
            {format(d, xFmt)}
          </text>
        ))}

        {/* stacked happiness bands */}
        {bands.map(({ track, lower, upper }) => (
          <motion.path
            key={track.id}
            initial={false}
            animate={{ d: mkArea(lower, upper) }}
            transition={morph}
            fill={`url(#${gid}-${track.id})`}
            stroke={hexToRgba(track.color, track.planned ? 0.35 : 0.55)}
            strokeWidth={1}
            strokeDasharray={track.planned ? '4 3' : undefined}
          />
        ))}

        {/* total outline */}
        <motion.path
          initial={false}
          animate={{ d: mkLine(total) }}
          transition={morph}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={1.75}
          strokeLinecap="round"
        />

        {/* achievement markers */}
        {tracks.map((tr) => {
          const tx = parseISO(tr.achieveDate).getTime()
          if (tx < t0 || tx > t1) return null
          const mx = x(tx)
          return (
            <g key={tr.id}>
              <line x1={mx} x2={mx} y1={padT} y2={H - padB} stroke={tr.color} strokeWidth={1} strokeDasharray={tr.planned ? '2 4' : '3 3'} opacity={0.5} />
              <circle cx={mx} cy={padT} r={3} fill={tr.planned ? 'var(--color-canvas)' : tr.color} stroke={tr.color} strokeWidth={1.5} />
            </g>
          )
        })}

        {/* scrubber */}
        {hi >= 0 && (
          <>
            <line x1={hx} x2={hx} y1={padT} y2={H - padB} stroke="var(--color-clay)" strokeWidth={1} opacity={0.7} />
            <circle cx={hx} cy={y(total[hi])} r={4} fill="var(--color-clay)" stroke="var(--color-canvas)" strokeWidth={2} />
          </>
        )}
      </svg>

      <AnimatePresence>
        {hi >= 0 && (
          <motion.div
            key="tip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute top-2 w-[180px] rounded-2xl border border-line bg-raised/95 p-3 shadow-lift backdrop-blur-sm"
            style={{ left: tipLeft }}
          >
            <div className="text-[11px] text-faint">{format(times[hi], 'MMM d, yyyy')}</div>
            <div className="font-serif text-xl text-ink">
              {total[hi].toFixed(1)} <span className="text-sm text-faint">happiness / yr</span>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {bands
                .map(({ track }, k) => ({ track, v: series[k][hi] }))
                .filter((b) => b.v > 0.05)
                .sort((a, b) => b.v - a.v)
                .slice(0, 5)
                .map(({ track, v }) => (
                  <div key={track.id} className="flex items-center gap-2 text-xs">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: track.color }} />
                    <span className="flex-1 truncate text-muted">{track.name}</span>
                    <span className="tabular text-faint">{v.toFixed(1)}</span>
                  </div>
                ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
