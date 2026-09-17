import { format, parseISO } from 'date-fns'
import { scaleLinear, scaleTime } from 'd3-scale'
import { area, curveMonotoneX, line } from 'd3-shape'
import { Flag } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useId, useRef, useState } from 'react'
import { currencyMeta, formatMoney, type Box, type ProjectionResult } from '@/domain'
import { fmtDate } from '@/lib/date'
import { fmtCompact } from '@/lib/format'
import { useElementWidth, useIsMobile } from '@/lib/hooks'
import { hexToRgba } from '@/lib/palette'
import { Money, useBaseCurrency } from '@/ui'

const morph = { type: 'spring' as const, stiffness: 130, damping: 26, mass: 0.9 }

/** A what-if scenario line drawn over the baseline; `values` align with result.points. */
export interface Overlay {
  id: string
  name: string
  color: string
  values: number[]
}

export function ProjectionChart({
  result,
  boxes,
  mode,
  overlays = [],
}: {
  result: ProjectionResult
  boxes: Box[]
  mode: 'nominal' | 'real'
  overlays?: Overlay[]
}) {
  const { ref, width } = useElementWidth()
  const mobile = useIsMobile()
  const base = useBaseCurrency()
  const symbol = currencyMeta(base).symbol
  const svgRef = useRef<SVGSVGElement | null>(null)
  const gid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)

  const P = result.points
  const H = mobile ? 280 : 360
  const padL = 10
  const padR = 12
  const padT = 18
  const padB = 26

  if (width < 2 || P.length < 2) {
    return <div ref={ref} className="h-[280px] w-full md:h-[360px]" />
  }

  const n = P.length
  const idx = P.map((_, i) => i)
  const scaleAt = (i: number) =>
    mode === 'real' && P[i].nominal > 0 ? P[i].real / P[i].nominal : 1

  // stacked per-box bands (mode-scaled)
  let cum = new Array(n).fill(0)
  const bands = boxes
    .filter((b) => P[0].perBox[b.id] !== undefined)
    .map((box) => {
      const lower = cum.slice()
      const upper = cum.map((c, i) => c + (P[i].perBox[box.id] ?? 0) * scaleAt(i))
      cum = upper
      return { box, lower, upper }
    })

  const activeTop = cum // = real total in real mode, nominal total otherwise
  const ghostTop = P.map((p) => (mode === 'real' ? p.nominal : p.real))

  const x = scaleTime()
    .domain([P[0].t, P[n - 1].t])
    .range([padL, width - padR])
  // overlays whose sample count matches the baseline (same projection options)
  const oks = overlays.filter((o) => o.values.length === n)
  const oFlat = oks.flatMap((o) => o.values)
  const yMax =
    Math.max(...P.map((p) => Math.max(p.nominal, p.real)), ...oFlat) * 1.08 || 1
  const yMin = Math.min(0, ...activeTop, ...ghostTop, ...oFlat)
  const y = scaleLinear().domain([yMin, yMax]).range([H - padB, padT])

  const mkArea = (lo: number[], hi: number[]) =>
    area<number>()
      .x((i) => x(P[i].t))
      .y0((i) => y(lo[i]))
      .y1((i) => y(hi[i]))
      .curve(curveMonotoneX)(idx) ?? ''
  const mkLine = (vals: number[]) =>
    line<number>()
      .x((i) => x(P[i].t))
      .y((i) => y(vals[i]))
      .curve(curveMonotoneX)(idx) ?? ''

  const yTicks = y.ticks(4)
  const spanYears = (P[n - 1].t - P[0].t) / (365.25 * 864e5)
  const xTicks = x.ticks(Math.min(6, Math.max(3, Math.round(spanYears))))
  const xFmt = spanYears <= 2.5 ? "MMM ''yy" : 'yyyy'

  const onMove = (e: React.PointerEvent) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const px = e.clientX - rect.left
    const t = Math.max(0, Math.min(1, (px - padL) / (width - padL - padR)))
    setHover(Math.round(t * (n - 1)))
  }

  const hi = hover ?? n - 1
  const hx = x(P[hi].t)
  const tipLeft = Math.max(8, Math.min(width - 208, hx - 100))

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
          {bands.map(({ box }) => (
            <linearGradient key={box.id} id={`${gid}-${box.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={hexToRgba(box.color, 0.6)} />
              <stop offset="100%" stopColor={hexToRgba(box.color, 0.05)} />
            </linearGradient>
          ))}
        </defs>

        {/* horizontal gridlines + y labels */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} strokeDasharray="2 5" />
            <text x={padL} y={y(t) - 4} fill="var(--color-faint)" fontSize={10} className="tabular">
              {symbol}
              {fmtCompact(t)}
            </text>
          </g>
        ))}

        {/* x labels */}
        {xTicks.map((d) => (
          <text key={+d} x={x(d)} y={H - 8} fill="var(--color-faint)" fontSize={10} textAnchor="middle">
            {format(d, xFmt)}
          </text>
        ))}

        {/* stacked bands */}
        {bands.map(({ box, lower, upper }) => (
          <motion.path
            key={box.id}
            initial={false}
            animate={{ d: mkArea(lower, upper) }}
            transition={morph}
            fill={`url(#${gid}-${box.id})`}
          />
        ))}

        {/* ghost line for the other mode (shows the inflation gap) */}
        <motion.path
          initial={false}
          animate={{ d: mkLine(ghostTop) }}
          transition={morph}
          fill="none"
          stroke="var(--color-faint)"
          strokeWidth={1.25}
          strokeDasharray="3 4"
          opacity={0.6}
        />

        {/* scenario overlays */}
        {oks.map((o) => (
          <g key={o.id}>
            <motion.path
              initial={false}
              animate={{ d: mkLine(o.values) }}
              transition={morph}
              fill="none"
              stroke={o.color}
              strokeWidth={1.75}
              strokeDasharray="5 4"
              strokeLinecap="round"
              opacity={0.95}
            />
            <circle cx={x(P[n - 1].t)} cy={y(o.values[n - 1])} r={3} fill={o.color} />
          </g>
        ))}

        {/* active total line */}
        <motion.path
          initial={false}
          animate={{ d: mkLine(activeTop) }}
          transition={morph}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={2}
          strokeLinecap="round"
        />

        {/* goal money-out markers — solid once achieved, hollow while only planned */}
        {result.markers.map((m) => {
          const mx = x(parseISO(m.date).getTime())
          return (
            <g key={m.id}>
              <line x1={mx} x2={mx} y1={padT} y2={H - padB} stroke={m.color} strokeWidth={1} strokeDasharray={m.planned ? '1 4' : '2 4'} opacity={m.planned ? 0.4 : 0.55} />
              <circle cx={mx} cy={padT} r={3} fill={m.planned ? 'var(--color-canvas)' : m.color} stroke={m.color} strokeWidth={m.planned ? 1.5 : 0} />
            </g>
          )
        })}

        {/* scrubber */}
        <line x1={hx} x2={hx} y1={padT} y2={H - padB} stroke="var(--color-clay)" strokeWidth={1} opacity={hover === null ? 0 : 0.7} />
        <circle cx={hx} cy={y(activeTop[hi])} r={4.5} fill="var(--color-clay)" stroke="var(--color-canvas)" strokeWidth={2} />
      </svg>

      {/* goal achievement labels */}
      {result.markers.map((m) => {
        const mx = x(parseISO(m.date).getTime())
        return (
          <div
            key={m.id}
            className="pointer-events-none absolute flex items-center gap-1 text-[10px]"
            style={{ left: Math.min(width - 96, mx + 5), top: padT - 3, color: m.color }}
          >
            <Flag className="size-2.5" />
            <span className="max-w-[88px] truncate">{m.label}</span>
          </div>
        )
      })}

      {/* scrubber tooltip */}
      <AnimatePresence>
        {hover !== null && (
        <motion.div
          key="tip"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="pointer-events-none absolute top-2 w-[200px] rounded-2xl border border-line bg-raised/95 p-3 shadow-lift backdrop-blur-sm"
          style={{ left: tipLeft }}
        >
          <div className="text-[11px] text-faint">{fmtDate(P[hi].date)}</div>
          <div className="font-serif text-xl text-ink">
            <Money report amount={mode === 'real' ? P[hi].real : P[hi].nominal} decimals={0} />
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {bands
              .map(({ box }) => ({ box, v: (P[hi].perBox[box.id] ?? 0) * scaleAt(hi) }))
              .sort((a, b) => b.v - a.v)
              .slice(0, 5)
              .map(({ box, v }) => (
                <div key={box.id} className="flex items-center gap-2 text-xs">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: box.color }} />
                  <span className="flex-1 truncate text-muted">{box.name}</span>
                  <span className="tabular text-faint">{formatMoney(v, base, { compact: true })}</span>
                </div>
              ))}
          </div>
          {oks.length > 0 && (
            <div className="mt-2 flex flex-col gap-1 border-t border-line pt-2">
              {oks.map((o) => {
                const d = o.values[hi] - activeTop[hi]
                return (
                  <div key={o.id} className="flex items-center gap-2 text-xs">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
                    <span className="flex-1 truncate text-muted">{o.name}</span>
                    <span className="tabular text-faint">
                      {formatMoney(o.values[hi], base, { compact: true })}
                    </span>
                    <span className={d >= 0 ? 'tabular text-sage' : 'tabular text-rust'}>
                      {formatMoney(d, base, { compact: true, sign: true })}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
