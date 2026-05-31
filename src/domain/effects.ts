/**
 * How effects bend value over time.
 *
 * Two channels:
 *  - the *nominal* factor: how the headline balance grows or shrinks
 *    (interest & appreciation lift it; depreciation & fees erode it).
 *  - the *real* discount: how inflation quietly eats purchasing power while
 *    leaving the nominal number untouched.
 */
import type { Compounding, Effect, EffectKind } from './types'

const PERIODS: Record<Exclude<Compounding, 'continuous'>, number> = {
  daily: 365,
  monthly: 12,
  quarterly: 4,
  annually: 1,
}

/** Multiplicative factor of a single rate over `years` (may be fractional). */
export function growthFactor(
  annualRate: number,
  compounding: Compounding,
  years: number,
): number {
  if (years === 0 || annualRate === 0) return 1
  if (compounding === 'continuous') return Math.exp(annualRate * years)
  const m = PERIODS[compounding]
  return Math.pow(1 + annualRate / m, m * years)
}

export const isGrowthKind = (k: EffectKind): boolean =>
  k === 'interest' || k === 'appreciation'

export const isNominalDecayKind = (k: EffectKind): boolean =>
  k === 'depreciation' || k === 'fee'

export const isInflationKind = (k: EffectKind): boolean => k === 'inflation'

/** Net effect on the *nominal* balance over `years` (product of all effects). */
export function nominalFactor(effects: Effect[], years: number): number {
  let f = 1
  for (const e of effects) {
    if (isGrowthKind(e.kind)) {
      f *= growthFactor(e.annualRate, e.compounding, years)
    } else if (isNominalDecayKind(e.kind)) {
      f *= growthFactor(-e.annualRate, e.compounding, years)
    }
  }
  return f
}

/** Factor (≤ 1 for positive inflation) converting nominal → real over `years`. */
export function realDiscount(effects: Effect[], years: number): number {
  let d = 1
  for (const e of effects) {
    if (isInflationKind(e.kind)) {
      d /= growthFactor(e.annualRate, e.compounding, years)
    }
  }
  return d
}

/** Convenience for live previews: what `principal` becomes after `years`. */
export function projectValue(
  principal: number,
  effects: Effect[],
  years: number,
): number {
  return principal * nominalFactor(effects, years)
}

/** The single blended annual growth rate of a set of effects (for labels). */
export function effectiveAnnualRate(effects: Effect[]): number {
  return nominalFactor(effects, 1) - 1
}
