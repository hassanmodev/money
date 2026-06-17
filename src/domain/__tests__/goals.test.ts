import { describe, expect, it } from 'vitest'
import { planGoals, sampleRating, weightAt } from '../goals'
import type { Box, FinanceState, Goal, Settings, Transaction } from '../types'

const settings: Settings = { baseCurrency: 'EUR', rates: { EUR: 1 } }

let n = 0
const box = (b: Partial<Box>): Box => ({
  id: `b${n++}`,
  name: 'Box',
  kind: 'savings',
  currency: 'EUR',
  openingBalance: 0,
  openingDate: '2025-01-01',
  color: '#d4845c',
  effects: [],
  createdAt: '2025-01-01T00:00:00Z',
  ...b,
})

const goal = (g: Partial<Goal> & Pick<Goal, 'id' | 'cost' | 'value'>): Goal => ({
  label: g.id,
  boxIds: [],
  status: 'open',
  createdAt: '2025-01-01T00:00:00Z',
  ...g,
})

const world = (boxes: Box[], goals: Goal[], transactions: Transaction[] = []): FinanceState => ({
  boxes,
  transactions,
  goals,
  settings,
})

const FROM = '2026-01-01'
const salary = (boxId: string, amount: number): Transaction => ({
  id: `inc-${boxId}`,
  kind: 'income',
  boxId,
  amount,
  currency: 'EUR',
  date: '2026-01-10',
  createdAt: '2025-01-01T00:00:00Z',
  recurrence: { every: 1, unit: 'month', anchor: '2026-01-10', end: { type: 'never' } },
})

describe('time weight', () => {
  it('is 1 now and decays into the future', () => {
    expect(weightAt(0, 0.15)).toBeCloseTo(1, 6)
    expect(weightAt(1, 0)).toBeCloseTo(1, 6) // no discount = flat
    expect(weightAt(1, 0.15)).toBeCloseTo(Math.exp(-0.15), 6)
    expect(weightAt(2, 0.2)).toBeLessThan(weightAt(1, 0.2))
  })
})

describe('rating curve sampling', () => {
  it('holds a flat value', () => {
    const s = sampleRating(7, FROM, 60, 10)
    expect(s.every((v) => v === 7)).toBe(true)
  })

  it('steps between points over time, holding each until the next', () => {
    const s = sampleRating(
      [
        { date: '2026-01-01', value: 8 },
        { date: '2028-01-01', value: 2 },
      ],
      FROM,
      48, // 4-year span
      5, // samples at 0,1,2,3,4 years
    )
    expect(s[0]).toBe(8) // today
    expect(s[4]).toBe(2) // four years out, past the breakpoint
    expect(s[0]).toBeGreaterThan(s[4])
  })
})

describe('greedy plan', () => {
  it('ranks by happiness per euro — best density first', () => {
    // both affordable immediately; B is worth more for the same price
    const b = box({ openingBalance: 100_000 })
    const plan = planGoals(
      world(
        [b],
        [goal({ id: 'A', cost: 1000, value: 5 }), goal({ id: 'B', cost: 1000, value: 8 })],
      ),
      { from: FROM, horizonMonths: 24, discount: 0.15 },
    )
    expect(plan.items[0].goal.id).toBe('B')
    expect(plan.items[0].density).toBeGreaterThan(plan.items[1].density)
    expect(plan.reachedCount).toBe(2)
  })

  it('buys the cheaper goal sooner when value ties (limited money over time)', () => {
    const b = box({ openingBalance: 0 })
    const plan = planGoals(
      world(
        [b],
        [goal({ id: 'big', cost: 6000, value: 5 }), goal({ id: 'small', cost: 3000, value: 5 })],
        [salary(b.id, 1000)],
      ),
      { from: FROM, horizonMonths: 18, discount: 0.15 },
    )
    const small = plan.items.find((i) => i.goal.id === 'small')!
    const big = plan.items.find((i) => i.goal.id === 'big')!
    expect(small.reachYear).not.toBeNull()
    expect(big.reachYear).not.toBeNull()
    // cheaper one is funded first, so it lands earlier
    expect(small.reachYear!).toBeLessThan(big.reachYear!)
  })

  it('honours funders: an empty funding box keeps a goal out of reach', () => {
    const rich = box({ id: 'rich', openingBalance: 100_000 })
    const poor = box({ id: 'poor', openingBalance: 0 })
    const plan = planGoals(
      world([rich, poor], [goal({ id: 'g', cost: 1000, value: 9, boxIds: ['poor'] })]),
      { from: FROM, horizonMonths: 24, discount: 0.15 },
    )
    // net worth is huge, but the goal's own box can't cover it
    expect(plan.items[0].reachYear).toBeNull()
    expect(plan.items[0].captured).toBe(0)
  })

  it('captures less the later a goal lands, but never more than its potential', () => {
    const b = box({ openingBalance: 0 })
    const plan = planGoals(
      world([b], [goal({ id: 'g', cost: 9000, value: 6 })], [salary(b.id, 1000)]),
      { from: FROM, horizonMonths: 24, discount: 0.2 },
    )
    const it0 = plan.items[0]
    expect(it0.reachYear).toBeGreaterThan(0)
    expect(it0.captured).toBeGreaterThan(0)
    expect(it0.captured).toBeLessThan(it0.potential) // discounted by the wait
  })

  it('with no discount, potential equals rating × horizon years', () => {
    const b = box({ openingBalance: 100_000 })
    const plan = planGoals(world([b], [goal({ id: 'g', cost: 1000, value: 5 })]), {
      from: FROM,
      horizonMonths: 12,
      discount: 0,
    })
    // 5 joy/yr for 1 year, achieved today → ~5
    expect(plan.items[0].potential).toBeCloseTo(5, 1)
    expect(plan.items[0].captured).toBeCloseTo(5, 1)
  })

  it('skips fulfilled goals', () => {
    const b = box({ openingBalance: 100_000 })
    const plan = planGoals(
      world([b], [goal({ id: 'done', cost: 1000, value: 5, status: 'done' })]),
      { from: FROM, horizonMonths: 12 },
    )
    expect(plan.items).toHaveLength(0)
  })
})
