/** Small presentational helpers for the Goals feature. */
import type { GoalValue, ValuePoint } from '@/domain'

/** Ratings live on a friendly 0..10 scale. */
export const RATING_MAX = 10

export const isCurveValue = (v: GoalValue): v is ValuePoint[] => Array.isArray(v)

/** A single representative rating: the flat number, or the curve's first value. */
export const leadValue = (v: GoalValue): number =>
  isCurveValue(v) ? (v[0]?.value ?? 0) : v

export const fmtRating = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(1)

/** "Worth 9" · "9 → 2 over time" — a glanceable read of a goal's rating. */
export function summarizeValue(v: GoalValue): string {
  if (!isCurveValue(v)) return `Worth ${fmtRating(v)}`
  if (!v.length) return 'No value yet'
  if (v.length === 1) return `Worth ${fmtRating(v[0].value)}`
  const sorted = [...v].sort((a, b) => a.date.localeCompare(b.date))
  return `${fmtRating(sorted[0].value)} → ${fmtRating(sorted[sorted.length - 1].value)} over time`
}

/** Happiness numbers read nicely: one decimal when small, whole when large. */
export const fmtHappiness = (n: number): string =>
  n >= 100 ? String(Math.round(n)) : n.toFixed(1)

/** The patience knob (discount/yr) read as a half-life — plain words. */
export function patienceLabel(discount: number): string {
  if (discount <= 0.001) return 'the future counts fully'
  const halfLife = Math.log(2) / discount
  if (halfLife >= 1) return `joy halves in ~${halfLife < 10 ? halfLife.toFixed(1) : Math.round(halfLife)} yr`
  return `joy halves in ~${Math.round(halfLife * 12)} mo`
}
