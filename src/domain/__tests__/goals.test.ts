import { describe, expect, it } from 'vitest'
import {
  RatingCurve,
  bankedHappiness,
  distanceWeight,
  goalHappiness,
  planGoals,
  type HappinessOptions,
} from '../goals'
import type { Goal } from '../types'

const NOW = '2026-01-01'
const HORIZON = '2030-01-01' // ~4 years
const opts: HappinessOptions = { now: NOW, horizon: HORIZON, halfLifeMonths: 24 }

let n = 0
const goal = (g: Partial<Goal>): Goal => ({
  id: `g${n++}`,
  name: 'Goal',
  cost: 100,
  value: { type: 'flat', rating: 5 },
  boxIds: [],
  status: 'open',
  color: '#9eb87f',
  createdAt: '2026-01-01T00:00:00Z',
  ...g,
})

describe('distance weighting', () => {
  it('is 1 today and halves over the half-life', () => {
    expect(distanceWeight(0, 24)).toBeCloseTo(1, 6)
    expect(distanceWeight(2, 24)).toBeCloseTo(0.5, 6) // 24 months out
    expect(distanceWeight(4, 24)).toBeCloseTo(0.25, 6)
  })
  it('never decays when the half-life is off', () => {
    expect(distanceWeight(10, 0)).toBe(1)
  })
})

describe('RatingCurve', () => {
  it('integrates a flat rating linearly with no discount', () => {
    const c = new RatingCurve({ type: 'flat', rating: 8 }, NOW)
    expect(c.area(0, 4, 0)).toBeCloseTo(32, 6) // 8 × 4 years
  })

  it('discounts distant happiness (area shrinks under decay)', () => {
    const c = new RatingCurve({ type: 'flat', rating: 8 }, NOW)
    const lambda = Math.LN2 / 2 // half-life 24 months = 2 years
    const expected = (8 * (1 - Math.exp(-lambda * 4))) / lambda
    expect(c.area(0, 4, 24)).toBeCloseTo(expected, 6)
    expect(c.area(0, 4, 24)).toBeLessThan(32)
  })

  it('reads a step curve, the first rating extending backward', () => {
    const c = new RatingCurve(
      { type: 'periods', points: [
        { from: '2026-01-01', rating: 2 },
        { from: '2027-01-01', rating: 6 },
      ] },
      NOW,
    )
    expect(c.rateAt(0)).toBe(2)
    expect(c.rateAt(0.5)).toBe(2)
    expect(c.rateAt(1.5)).toBe(6)
    expect(c.rateAt(-1)).toBe(2) // first extends back
  })
})

describe('goalHappiness', () => {
  it('rewards achieving sooner', () => {
    const g = goal({ value: { type: 'flat', rating: 7 } })
    const soon = goalHappiness(g, NOW, opts)
    const later = goalHappiness(g, '2027-01-01', opts)
    expect(soon).toBeGreaterThan(later)
  })
})

describe('bankedHappiness', () => {
  it('counts only achieved goals, from their achieved date', () => {
    const done = goal({ status: 'done', doneDate: NOW, value: { type: 'flat', rating: 5 } })
    const open = goal({ status: 'open' })
    expect(bankedHappiness([done, open], opts)).toBeCloseTo(goalHappiness(done, NOW, opts), 6)
  })
})

describe('planGoals (greedy knapsack)', () => {
  it('takes the best happiness-per-cost first and stops at the budget', () => {
    const free = goal({ id: 'free', cost: 0, value: { type: 'flat', rating: 4 } })
    const rich = goal({ id: 'rich', cost: 100, value: { type: 'flat', rating: 9 } })
    const poor = goal({ id: 'poor', cost: 100, value: { type: 'flat', rating: 3 } })
    const plan = planGoals([free, rich, poor], 150, opts)

    expect(plan.chosen.map((c) => c.goal.id)).toEqual(['free', 'rich'])
    expect(plan.skipped.map((c) => c.goal.id)).toEqual(['poor'])
    expect(plan.spend).toBe(100)
    expect(plan.happiness).toBeCloseTo(
      goalHappiness(free, NOW, opts) + goalHappiness(rich, NOW, opts),
      6,
    )
  })

  it('with no budget keeps only free goals', () => {
    const free = goal({ id: 'free', cost: 0, value: { type: 'flat', rating: 4 } })
    const paid = goal({ id: 'paid', cost: 50 })
    const plan = planGoals([free, paid], 0, opts)
    expect(plan.chosen.map((c) => c.goal.id)).toEqual(['free'])
    expect(plan.spend).toBe(0)
  })

  it('ignores goals that aren\'t open', () => {
    const open = goal({ id: 'open', cost: 10 })
    const done = goal({ id: 'done', cost: 10, status: 'done', doneDate: NOW })
    const shelved = goal({ id: 'shelved', cost: 10, status: 'dismissed' })
    const plan = planGoals([open, done, shelved], 1000, opts)
    expect(plan.chosen.map((c) => c.goal.id)).toEqual(['open'])
  })
})
