/**
 * Small shared helpers for the time tab — formatting and placement rules,
 * kept out of the components so each file stays one idea.
 */
import { DAY_MIN, STEP_MIN, type BlockLayer, type ISODate } from '@/domain/time'

/** Snap minutes to the grid's 10-minute resolution. */
export const snapStep = (min: number): number => Math.round(min / STEP_MIN) * STEP_MIN

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/** "14:05" for a minute-of-day, wrapping past midnight. */
export const hhmm = (minute: number): string => {
  const m = ((minute % DAY_MIN) + DAY_MIN) % DAY_MIN
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** "9:00–13:00" */
export const fmtRange = (startMin: number, durationMin: number): string =>
  `${hhmm(startMin)}–${hhmm(startMin + durationMin)}`

/** "2h" · "2.5h" */
export const fmtHours = (min: number): string => {
  const h = Math.round(min / 6) / 10
  return `${Number.isInteger(h) ? String(h) : h.toFixed(1)}h`
}

export type ViewMode = 'plan' | 'reality' | 'both'

export interface NowPoint {
  date: ISODate
  minute: number
}

export const isPast = (date: ISODate, startMin: number, now: NowPoint): boolean =>
  date < now.date || (date === now.date && startMin < now.minute)

/**
 * Which layer a new placement lands on: plan mode always plans, reality mode
 * always records; in both, the past is recorded and the future is planned.
 */
export const layerFor = (mode: ViewMode, date: ISODate, startMin: number, now: NowPoint): BlockLayer =>
  mode === 'plan' ? 'plan' : mode === 'reality' ? 'actual' : isPast(date, startMin, now) ? 'actual' : 'plan'

/** dataTransfer type for dragging a project out of the sidebar onto the grid. */
export const PROJECT_DRAG_MIME = 'application/x-cozy-time-project'

/**
 * Display zoom = px per hour. The label names the duration that stays
 * glanceable at that zoom — data resolution is always 10 minutes.
 */
export const ZOOMS = [
  { value: '20m', pxPerHour: 144 },
  { value: '30m', pxPerHour: 96 },
  { value: '1h', pxPerHour: 48 },
  { value: '2h', pxPerHour: 24 },
  { value: '½d', pxPerHour: 6 },
] as const
export type ZoomValue = (typeof ZOOMS)[number]['value']
