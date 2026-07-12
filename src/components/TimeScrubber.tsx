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
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { History, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/cn'
import { addDaysISO, daysBetween, fmtDate, todayISO } from '@/lib/date'
import { formatMoney, project } from '@/domain'
import { useFinanceState } from '@/store/selectors'
import { useTimeTravel, useViewDate } from '@/store/time'

// ── the timeline's shape ────────────────────────────────────────────────────
const ANCHOR = 0.16 // where "today" sits along the track (near the left)
const PAST_MONTHS = 36 // how far back the left edge reaches (3 years)
const FUTURE_MONTHS = 5 * 12 // how far ahead the right edge reaches (5 years)
const GAMMA = 1.9 // curve steepness: >1 ⇒ fine near today, fast at the edges
const DAYS_PER_MONTH = 365.25 / 12
const SNAP_DAYS = 0 // magnetic pull back to today near the anchor

// Year ticks hung along the horizon. Majors are labelled and taller; minors are
// short hairlines that break up the runway so it reads as a ruler, not a smear.
const MAJOR_YEARS = new Set([-3, -2, -1, 1, 2, 3, 5, 7, 10, 15, 20, 30])
const YEAR_TICKS = (() => {
  const ticks: { yr: number; major: boolean }[] = []
  for (let y = -3; y <= 30; y++) {
    if (y === 0) continue
    const major = MAJOR_YEARS.has(y)
    // minors only crowd the near future, where they have room to breathe
    if (!major && (y < 1 || y > 12)) continue
    ticks.push({ yr: y, major })
  }
  return ticks
})()

// Spacing rules for the "nice numbers reached" milestones strewn along the runway.
const MILESTONE_GAP = 0.05 // min track-fraction between two milestone marks
const MILESTONE_FLOOR = 1000 // don't bother flagging anything under this

const MS_PER_DAY = 86_400_000

/** "Roundness" of a milestone — 10s beat 5s beat 2.5s when two marks collide. */
function niceness(v: number): number {
  const m = v / 10 ** Math.floor(Math.log10(v))
  return m < 1.5 ? 2 : m < 3 ? 0 : 1
}

/** The 1 / 2.5 / 5 × 10ⁿ ladder strictly between `start` and `end` (≥ floor). */
function niceMilestones(start: number, end: number): number[] {
  const out: number[] = []
  const lo = Math.max(start, 0)
  if (!(end > lo)) return out
  const startExp = Math.max(3, Math.floor(Math.log10(Math.max(lo, 1))))
  for (let e = startExp; e <= 15; e++) {
    for (const m of [1, 2.5, 5]) {
      const v = m * 10 ** e
      if (v < MILESTONE_FLOOR || v <= lo) continue
      if (v > end) return out
      out.push(v)
    }
  }
  return out
}

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
  const view = useViewDate()
  const setViewDate = useTimeTravel((s) => s.setViewDate)
  const reset = useTimeTravel((s) => s.reset)
  const state = useFinanceState()

  const trackRef = useRef<HTMLDivElement>(null)
  const frame = useRef<number | null>(null)
  const pendingX = useRef(0)
  const [dragging, setDragging] = useState(false)

  const today = todayISO()
  const base = state.settings.baseCurrency

  // "Nice numbers reached" — project net worth out to the horizon and flag the
  // dates it first crosses each round figure ($10k, $25k…), strewn as little
  // sage diamonds along the runway. Recomputed only when the world changes.
  const milestones = useMemo(() => {
    const proj = project(state, { from: today, to: addDaysISO(today, MAX_DAYS), steps: 120 })
    const pts = proj.points
    if (pts.length < 2) return []
    const t0 = pts[0].t
    const targets = niceMilestones(pts[0].nominal, pts[pts.length - 1].nominal)
    const raw: { value: number; frac: number }[] = []
    let i = 1
    for (const v of targets) {
      while (i < pts.length && pts[i].nominal < v) i++
      if (i >= pts.length) break
      const a = pts[i - 1]
      const b = pts[i]
      const span = b.nominal - a.nominal
      const t = a.t + (b.t - a.t) * (span > 0 ? (v - a.nominal) / span : 0)
      raw.push({ value: v, frac: daysToFraction(Math.round((t - t0) / MS_PER_DAY)) })
    }
    // thin collisions, keeping the rounder number when two marks crowd
    const kept: { value: number; frac: number }[] = []
    for (const m of raw) {
      const last = kept[kept.length - 1]
      if (last && m.frac - last.frac < MILESTONE_GAP) {
        if (niceness(m.value) > niceness(last.value)) kept[kept.length - 1] = m
      } else kept.push(m)
    }
    return kept
      .filter((m) => m.frac > ANCHOR + 0.015 && m.frac < 0.985)
      // one decimal so the 2.5× rungs read "2.5M", not a rounded "3M"
      .map((m) => ({ ...m, label: formatMoney(m.value, base, { compact: true, decimals: 1 }) }))
  }, [state, today, base])

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

  // A small, dark date murmured behind the slider — present but never shouting.
  // It lifts a touch (and warms toward the travel accent) only when you've left
  // today, otherwise it sits back in a near-canvas tone.
  const bigDate = traveling ? fmtDate(view) : fmtDate(today)

  return (
    <div
      className={cn(
        'relative border-b bg-canvas/90 backdrop-blur-md transition-colors duration-500',
        traveling ? 'border-transparent' : 'border-line',
      )}
      style={
        traveling
          ? { boxShadow: `0 10px 34px -22px ${accent}, inset 0 -1px 0 0 ${accent}55` }
          : undefined
      }
    >
      {/* ── the date, murmured small and dark behind the controls ──────────── */}
      <div className="pointer-events-none absolute inset-x-5 top-3 grid place-items-center md:inset-x-10">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={bigDate}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, position: 'absolute' }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="select-none whitespace-nowrap font-serif text-sm font-light italic tracking-tight transition-colors duration-500"
            style={{ color: traveling ? `${accent}cc` : 'var(--color-ghost)' }}
          >
            {bigDate}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="relative mx-auto flex min-h-[7.25rem] max-w-5xl items-end gap-3 px-5 pb-2 pt-4 md:gap-5 md:px-10">
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

          {/* year ticks + labels — majors carry a 'YY label, minors are hairlines */}
          {YEAR_TICKS.map(({ yr, major }) => {
            const left = daysToFraction(Math.round(yr * 365.25)) * 100
            if (left < 1 || left > 99) return null
            const label = `'${String((parseInt(today.slice(0, 4), 10) + yr) % 100).padStart(2, '0')}`
            return (
              <div
                key={yr}
                className="pointer-events-none absolute -translate-x-1/2"
                style={{ left: `${left}%` }}
              >
                <div
                  className={cn(
                    'absolute -translate-x-1/2 w-px',
                    major ? 'top-[32px] h-2.5 bg-line-2' : 'top-[34px] h-1.5 bg-line',
                  )}
                />
                {major && (
                  <div className="absolute top-[44px] -translate-x-1/2 text-[9px] tabular text-ghost">
                    {label}
                  </div>
                )}
              </div>
            )
          })}

          {/* "nice numbers reached" — round net-worth figures along the runway */}
          {milestones.map((m) => (
            <div
              key={m.value}
              className="pointer-events-none absolute -translate-x-1/2"
              style={{ left: `${m.frac * 100}%` }}
            >
              <div className="absolute top-[14px] -translate-x-1/2 whitespace-nowrap text-[9px] font-medium tabular text-sage/90">
                {m.label}
              </div>
              <div className="absolute top-[26px] h-2 w-px -translate-x-1/2 bg-sage/25" />
              <div className="absolute top-[34px] size-[5px] -translate-x-1/2 rotate-45 rounded-[1px] bg-sage/80" />
            </div>
          ))}

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

          {/* minimal caption riding above the needle — just the *distance*,
              since the full date now lives large in the background */}
          <motion.div
            className="pointer-events-none absolute top-1 -translate-x-1/2"
            style={{ left: `${pillLeft}%` }}
            animate={{ left: `${pillLeft}%` }}
            transition={
              dragging ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
            }
          >
            <div
              className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.14em] transition-colors duration-300"
              style={{ color: traveling ? accent : 'var(--color-faint)' }}
            >
              {offsetLabel(offsetDays)}
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
