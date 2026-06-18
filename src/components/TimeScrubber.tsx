/**
 * The time machine — a horizon you scrub to move the whole app's "today".
 *
 * Not an `<input type=range>`: a hand-built timeline. "Today" is anchored near
 * the left so there's a long runway into the future (and a little road back).
 * The needle maps to a *non-linear* offset — months near the anchor, years out
 * at the edges — so the near term gets fine control while a decade stays in
 * reach. Dragging it reframes every projection, balance and plan in the app to
 * that date; the pill names where (and when) you are.
 */
import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { History, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { addDaysISO, daysBetween, fmtDate, todayISO } from '@/lib/date'
import { useTimeTravel } from '@/store/time'

// ── the timeline's shape ────────────────────────────────────────────────────
const ANCHOR = 0.18 // where "today" sits along the track (near the left)
const PAST_MONTHS = 24 // how far back the left edge reaches
const FUTURE_MONTHS = 120 // how far ahead the right edge reaches (10 years)
const GAMMA = 1.8 // curve steepness: >1 ⇒ fine near today, fast at the edges
const DAYS_PER_MONTH = 365.25 / 12
const SNAP_DAYS = 8 // magnetic pull back to today near the anchor

// Tick marks (and labels) hung along the horizon, by whole-year offset.
const YEAR_TICKS = [-2, -1, 1, 2, 3, 5, 10]

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

/** Track fraction (0..1) → signed month offset from today. */
function fractionToMonths(p: number): number {
  if (p >= ANCHOR) {
    const f = clamp01((p - ANCHOR) / (1 - ANCHOR))
    return FUTURE_MONTHS * f ** GAMMA
  }
  const f = clamp01((ANCHOR - p) / ANCHOR)
  return -PAST_MONTHS * f ** GAMMA
}

/** Signed month offset → track fraction (0..1) — the inverse, for rendering. */
function monthsToFraction(m: number): number {
  if (m >= 0) {
    const f = Math.min(1, m / FUTURE_MONTHS) ** (1 / GAMMA)
    return ANCHOR + f * (1 - ANCHOR)
  }
  const f = Math.min(1, -m / PAST_MONTHS) ** (1 / GAMMA)
  return ANCHOR - f * ANCHOR
}

const MIN_DAYS = Math.round(-PAST_MONTHS * DAYS_PER_MONTH)
const MAX_DAYS = Math.round(FUTURE_MONTHS * DAYS_PER_MONTH)
const clampDays = (d: number) => Math.max(MIN_DAYS, Math.min(MAX_DAYS, d))

/** A signed day offset → fraction along the track. */
const daysToFraction = (days: number) => monthsToFraction(days / DAYS_PER_MONTH)

/** "Today" · "in 1y 2mo" · "8mo ago" — a human read of the cursor's distance. */
function offsetLabel(offsetDays: number): string {
  if (offsetDays === 0) return 'Today'
  const fwd = offsetDays > 0
  const days = Math.abs(offsetDays)
  let core: string
  if (days < 14) core = `${days} day${days > 1 ? 's' : ''}`
  else if (days < 31) core = `${Math.round(days / 7)} weeks`
  else {
    const months = Math.round(days / DAYS_PER_MONTH)
    const y = Math.floor(months / 12)
    const m = months % 12
    core = [y ? `${y}y` : '', m ? `${m}mo` : ''].filter(Boolean).join(' ') || '1mo'
  }
  return fwd ? `in ${core}` : `${core} ago`
}

export function TimeScrubber() {
  const view = useTimeTravel((s) => s.viewDate)
  const setViewDate = useTimeTravel((s) => s.setViewDate)
  const reset = useTimeTravel((s) => s.reset)

  const trackRef = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)
  const pendingX = useRef(0)
  const [dragging, setDragging] = useState(false)

  const today = todayISO()
  const offsetDays = daysBetween(today, view) // signed: + future, − past
  const p = daysToFraction(offsetDays)
  const traveling = offsetDays !== 0
  const dir = Math.sign(offsetDays) // 1 future, −1 past, 0 today

  // Warm tones travelling forward, cool tones rewinding — so direction reads at
  // a glance even before the date does.
  const accent = dir > 0 ? '#d4845c' : dir < 0 ? '#8aa0c8' : '#7c7062'
  const accent2 = dir > 0 ? '#e7b079' : dir < 0 ? '#74b1a3' : '#7c7062'

  // commit a pointer x-position to a view date (snapping near today)
  const apply = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const frac = clamp01((clientX - rect.left) / rect.width)
    let days = Math.round(fractionToMonths(frac) * DAYS_PER_MONTH)
    if (Math.abs(days) <= SNAP_DAYS) days = 0
    setViewDate(addDaysISO(todayISO(), clampDays(days)))
  }

  // coalesce moves to one update per frame — the heavy recompute is downstream
  const schedule = (clientX: number) => {
    pendingX.current = clientX
    if (frame.current != null) return
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      apply(pendingX.current)
    })
  }

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current)
    },
    [],
  )

  const nudge = (deltaDays: number) =>
    setViewDate(addDaysISO(todayISO(), clampDays(offsetDays + deltaDays)))

  const onKeyDown = (e: React.KeyboardEvent) => {
    const big = e.shiftKey
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        nudge(big ? 365 : 30)
        break
      case 'ArrowLeft':
      case 'ArrowDown':
        nudge(big ? -365 : -30)
        break
      case 'PageUp':
        nudge(365)
        break
      case 'PageDown':
        nudge(-365)
        break
      case 'Home':
        reset()
        break
      default:
        return
    }
    e.preventDefault()
  }

  const pillLeft = clamp01(p) * 100
  const pillShift = `${clamp01(p) <= 0.12 ? 0 : clamp01(p) >= 0.88 ? -100 : -50}%`

  return (
    <div
      className={cn(
        'border-b bg-canvas/70 backdrop-blur-md transition-colors duration-500',
        traveling ? 'border-transparent' : 'border-line',
      )}
      style={
        traveling
          ? { boxShadow: `0 10px 34px -22px ${accent}, inset 0 -1px 0 0 ${accent}55` }
          : undefined
      }
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-2.5 md:gap-5 md:px-10">
        {/* leading glyph — a quiet "you are here in time" cue */}
        <div
          className="hidden size-9 shrink-0 place-items-center rounded-xl border transition-colors duration-500 sm:grid"
          style={{
            borderColor: traveling ? `${accent}66` : 'var(--color-line)',
            backgroundColor: traveling ? `${accent}14` : 'var(--color-raised)',
            color: traveling ? accent : 'var(--color-faint)',
          }}
        >
          <History className="size-[18px]" />
        </div>

        {/* the horizon */}
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Time travel — the date the app treats as today"
          aria-valuemin={MIN_DAYS}
          aria-valuemax={MAX_DAYS}
          aria-valuenow={offsetDays}
          aria-valuetext={`${fmtDate(view)} — ${offsetLabel(offsetDays)}`}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setDragging(true)
            apply(e.clientX)
          }}
          onPointerMove={(e) => dragging && schedule(e.clientX)}
          onPointerUp={(e) => {
            setDragging(false)
            e.currentTarget.releasePointerCapture(e.pointerId)
          }}
          onPointerCancel={() => setDragging(false)}
          onKeyDown={onKeyDown}
          className={cn(
            'relative h-16 flex-1 touch-none select-none outline-none',
            dragging ? 'cursor-grabbing' : 'cursor-pointer',
          )}
        >
          {/* baseline horizon */}
          <div className="pointer-events-none absolute inset-x-0 top-[37px] h-px bg-gradient-to-r from-transparent via-line-2 to-transparent" />

          {/* year ticks + labels */}
          {YEAR_TICKS.map((yr) => {
            const left = daysToFraction(Math.round(yr * 365.25)) * 100
            if (left < 1 || left > 99) return null
            const label = `'${String((parseInt(today.slice(0, 4), 10) + yr) % 100).padStart(2, '0')}`
            return (
              <div
                key={yr}
                className="pointer-events-none absolute -translate-x-1/2"
                style={{ left: `${left}%` }}
              >
                <div className="absolute top-[33px] h-2 w-px -translate-x-1/2 bg-line-2" />
                <div className="absolute top-[44px] -translate-x-1/2 text-[9px] tabular text-ghost">
                  {label}
                </div>
              </div>
            )
          })}

          {/* the "today" anchor — home base */}
          <div
            className="pointer-events-none absolute -translate-x-1/2"
            style={{ left: `${ANCHOR * 100}%` }}
          >
            <div className="absolute top-[31px] size-1.5 -translate-x-1/2 rounded-full bg-faint ring-2 ring-canvas" />
            <div className="absolute top-[44px] -translate-x-1/2 text-[9px] uppercase tracking-[0.12em] text-faint">
              now
            </div>
          </div>

          {/* travelled trail, anchor → needle */}
          {traveling && (
            <div
              className="pointer-events-none absolute top-[36.5px] h-[3px] rounded-full"
              style={{
                left: `${Math.min(ANCHOR, p) * 100}%`,
                width: `${Math.abs(p - ANCHOR) * 100}%`,
                background:
                  dir > 0
                    ? `linear-gradient(90deg, ${accent}, ${accent2})`
                    : `linear-gradient(90deg, ${accent2}, ${accent})`,
                boxShadow: `0 0 12px -2px ${accent}`,
              }}
            />
          )}

          {/* the needle */}
          <motion.div
            className="pointer-events-none absolute top-[24px] -translate-x-1/2"
            style={{ left: `${p * 100}%` }}
            animate={{ left: `${p * 100}%` }}
            transition={
              dragging
                ? { duration: 0 }
                : { type: 'spring', stiffness: 420, damping: 34 }
            }
          >
            <div
              className="h-[26px] w-[2.5px] -translate-x-1/2 rounded-full"
              style={{
                backgroundColor: traveling ? accent : 'var(--color-muted)',
                boxShadow: traveling ? `0 0 10px 0 ${accent}` : undefined,
              }}
            />
            <div
              className="absolute -top-[3px] left-1/2 size-2.5 -translate-x-1/2 rounded-full ring-2 ring-canvas"
              style={{ backgroundColor: traveling ? accent : 'var(--color-ink)' }}
            />
          </motion.div>

          {/* floating date pill, riding above the needle */}
          <motion.div
            className="pointer-events-none absolute top-0"
            style={{ left: `${pillLeft}%` }}
            animate={{ left: `${pillLeft}%` }}
            transition={
              dragging ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
            }
          >
            <div
              className="rounded-lg border bg-raised/90 px-2.5 py-1 shadow-soft backdrop-blur-sm transition-colors duration-300"
              style={{
                transform: `translateX(${pillShift})`,
                borderColor: traveling ? `${accent}55` : 'var(--color-line)',
              }}
            >
              <div
                className="whitespace-nowrap font-serif text-[13px] leading-tight"
                style={{ color: traveling ? accent : 'var(--color-ink)' }}
              >
                {traveling ? fmtDate(view) : 'Today'}
              </div>
              <div className="whitespace-nowrap text-[10px] leading-tight text-faint">
                {traveling ? offsetLabel(offsetDays) : fmtDate(today)}
              </div>
            </div>
          </motion.div>
        </div>

        {/* reset — slides in only when you've left today */}
        <motion.div
          initial={false}
          animate={{ opacity: traveling ? 1 : 0, width: traveling ? 'auto' : 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <button
            type="button"
            onClick={reset}
            tabIndex={traveling ? 0 : -1}
            className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-raised/60 px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-line-2 hover:text-ink"
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">Today</span>
          </button>
        </motion.div>
      </div>
    </div>
  )
}
