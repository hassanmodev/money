import { describe, expect, it } from 'vitest'
import { growthFactor, nominalFactor, projectValue, realDiscount } from '../effects'
import type { Effect } from '../types'

const eff = (e: Partial<Effect>): Effect => ({
  id: 'e',
  kind: 'interest',
  annualRate: 0.05,
  compounding: 'annually',
  ...e,
})

describe('growthFactor', () => {
  it('compounds annually as (1+r)^t', () => {
    expect(growthFactor(0.1, 'annually', 1)).toBeCloseTo(1.1, 10)
    expect(growthFactor(0.1, 'annually', 3)).toBeCloseTo(1.331, 10)
  })

  it('compounds monthly more than annually', () => {
    expect(growthFactor(0.12, 'monthly', 1)).toBeCloseTo(1.12682503, 6)
    expect(growthFactor(0.12, 'monthly', 1)).toBeGreaterThan(
      growthFactor(0.12, 'annually', 1),
    )
  })

  it('continuous compounding is e^(rt)', () => {
    expect(growthFactor(0.05, 'continuous', 2)).toBeCloseTo(Math.exp(0.1), 10)
  })

  it('is the identity over zero time or zero rate', () => {
    expect(growthFactor(0.5, 'daily', 0)).toBe(1)
    expect(growthFactor(0, 'daily', 10)).toBe(1)
  })
})

describe('nominalFactor', () => {
  it('lifts value for growth kinds', () => {
    expect(projectValue(1000, [eff({ kind: 'interest', annualRate: 0.05 })], 1)).toBeCloseTo(
      1050,
      6,
    )
  })

  it('erodes value for nominal-decay kinds', () => {
    expect(
      projectValue(1000, [eff({ kind: 'depreciation', annualRate: 0.1 })], 1),
    ).toBeCloseTo(900, 6)
  })

  it('ignores inflation in the nominal channel', () => {
    expect(nominalFactor([eff({ kind: 'inflation', annualRate: 0.03 })], 5)).toBe(1)
  })

  it('multiplies independent effects together', () => {
    const f = nominalFactor(
      [
        eff({ kind: 'interest', annualRate: 0.05 }),
        eff({ kind: 'fee', annualRate: 0.01 }),
      ],
      1,
    )
    expect(f).toBeCloseTo(1.05 * 0.99, 10)
  })
})

describe('realDiscount', () => {
  it('shrinks purchasing power under inflation', () => {
    expect(realDiscount([eff({ kind: 'inflation', annualRate: 0.03 })], 1)).toBeCloseTo(
      1 / 1.03,
      10,
    )
  })

  it('is unaffected by growth effects', () => {
    expect(realDiscount([eff({ kind: 'interest', annualRate: 0.2 })], 5)).toBe(1)
  })
})
