import { describe, expect, it } from 'vitest'
import {
  DEFAULT_UPGRADE_LOSS,
  RATING_MAX,
  RatingCurve,
  bankedHappiness,
  distanceWeight,
  goalHappiness,
  planGoals,
  planGoalsScheduled,
  umbrellaMultiplierAt,
  umbrellaSources,
  type HappinessOptions,
  type ScheduleOptions,
} from '../goals'
import type { Goal, GoalGroup } from '../types'

const NOW = '2026-01-01'
const HORIZON = '2030-01-01' // ~4 years
const opts: HappinessOptions = { now: NOW, horizon: HORIZON, halfLifeMonths: 24 }

let n = 0
const goal = (g: Partial<Goal>): Goal => ({
  id: `g${n++}`,
  name: 'Goal',
  cost: 100,
  value: { type: 'flat', rating: 5 },
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

describe('umbrella goals (the happiness multiplier)', () => {
  // a flat, no-decay world keeps the arithmetic exact and legible
  const flat: HappinessOptions = { now: NOW, horizon: HORIZON, halfLifeMonths: 0 }
  const umbrellaGoal = (over: Partial<Goal> = {}) =>
    goal({ id: 'umb', umbrella: { boost: 0.5 }, value: { type: 'flat', rating: RATING_MAX }, ...over })

  it('a maxed umbrella applies its full boost; a zero-rated one applies none', () => {
    const maxed = umbrellaSources([umbrellaGoal({ status: 'done', doneDate: NOW })], flat, (g) => g.doneDate)
    const off = umbrellaSources(
      [umbrellaGoal({ status: 'done', doneDate: NOW, value: { type: 'flat', rating: 0 } })],
      flat,
      (g) => g.doneDate,
    )
    expect(umbrellaMultiplierAt(maxed, 1)).toBeCloseTo(1.5, 6) // 1 + 0.5 × (10/10)
    expect(umbrellaMultiplierAt(off, 1)).toBeCloseTo(1, 6) // 1 + 0.5 × 0
  })

  it('lifts another goal by the multiplier, but never itself', () => {
    const sources = umbrellaSources([umbrellaGoal({ status: 'done', doneDate: NOW })], flat, (g) => g.doneDate)
    const reg = goal({ id: 'reg', value: { type: 'flat', rating: 6 } })
    const bare = goalHappiness(reg, NOW, flat)
    expect(goalHappiness(reg, NOW, flat, sources)).toBeCloseTo(1.5 * bare, 6)
    // the umbrella isn't boosted by itself
    const umb = umbrellaGoal({ status: 'done', doneDate: NOW })
    expect(goalHappiness(umb, NOW, flat, sources)).toBeCloseTo(goalHappiness(umb, NOW, flat), 6)
  })

  it('only boosts happiness earned after the umbrella is achieved', () => {
    // umbrella switches on at year 2, doubling everything from then on (boost 1)
    const umb = goal({
      id: 'umb',
      umbrella: { boost: 1 },
      value: { type: 'flat', rating: RATING_MAX },
      status: 'done',
      doneDate: '2028-01-01',
    })
    const sources = umbrellaSources([umb], flat, (g) => g.doneDate)
    const reg = goal({ id: 'reg', value: { type: 'flat', rating: 5 } })
    // 5×2yr at ×1, then 5×2yr at ×2  →  10 + 20 = 30 (bare would be 5×4 = 20)
    expect(goalHappiness(reg, NOW, flat)).toBeCloseTo(20, 6)
    // ≈30 (the switch-on lands at 1.9986y, not exactly 2, under a 365.25-day year)
    expect(goalHappiness(reg, NOW, flat, sources)).toBeCloseTo(30, 1)
  })

  it('bankedHappiness folds the lift into already-achieved goals', () => {
    const umb = umbrellaGoal({ status: 'done', doneDate: NOW })
    const reg = goal({ id: 'reg', status: 'done', doneDate: NOW, value: { type: 'flat', rating: 4 } })
    const sources = umbrellaSources([umb], flat, (g) => g.doneDate)
    const expected = goalHappiness(umb, NOW, flat) + goalHappiness(reg, NOW, flat, sources)
    expect(bankedHappiness([umb, reg], flat)).toBeCloseTo(expected, 6)
    // and it genuinely beats the unamplified total
    expect(bankedHappiness([umb, reg], flat)).toBeGreaterThan(
      goalHappiness(umb, NOW, flat) + goalHappiness(reg, NOW, flat),
    )
  })

  it('the planner schedules an umbrella and credits the lift it gives others', () => {
    const grid = ['2026-01-01', '2027-01-01', '2028-01-01', '2029-01-01']
    const base = { now: NOW, horizon: HORIZON, halfLifeMonths: 0, grid, budgetCurve: [1000, 1000, 1000, 1000] }
    const r1 = goal({ id: 'r1', cost: 50, value: { type: 'flat', rating: 8 } })
    const r2 = goal({ id: 'r2', cost: 50, value: { type: 'flat', rating: 6 } })
    const umb = umbrellaGoal({ cost: 50 })
    const ordinary = goal({ id: 'umb', cost: 50, value: { type: 'flat', rating: RATING_MAX } }) // same goal, no umbrella flag

    const withUmbrella = planGoalsScheduled([umb, r1, r2], base as ScheduleOptions)
    const without = planGoalsScheduled([ordinary, r1, r2], base as ScheduleOptions)

    // all three fit, and the umbrella is one of them
    expect(withUmbrella.scheduled.map((s) => s.goal.id).sort()).toEqual(['r1', 'r2', 'umb'])
    // the lift makes the same set of purchases worth strictly more
    const lift = 0.5 * (goalHappiness(r1, NOW, base) + goalHappiness(r2, NOW, base))
    expect(withUmbrella.happiness).toBeCloseTo(without.happiness + lift, 6)
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

describe('planGoalsScheduled (time-aware planner)', () => {
  // A yearly grid out to the horizon; no decay keeps the arithmetic legible.
  const grid = ['2026-01-01', '2027-01-01', '2028-01-01', '2029-01-01']
  const flat = (now = NOW, halfLifeMonths = 0): Omit<ScheduleOptions, 'budgetCurve'> => ({
    now,
    horizon: HORIZON,
    halfLifeMonths,
    grid,
  })

  it('with a flat (non-growing) pot, matches the greedy knapsack and buys now', () => {
    const free = goal({ id: 'free', cost: 0, value: { type: 'flat', rating: 4 } })
    const rich = goal({ id: 'rich', cost: 100, value: { type: 'flat', rating: 9 } })
    const poor = goal({ id: 'poor', cost: 100, value: { type: 'flat', rating: 3 } })
    const o: ScheduleOptions = { ...flat(), budgetCurve: [150, 150, 150, 150] }
    const plan = planGoalsScheduled([free, rich, poor], o)

    expect(plan.scheduled.map((s) => s.goal.id).sort()).toEqual(['free', 'rich'])
    expect(plan.scheduled.every((s) => s.achieveDate === NOW)).toBe(true) // sooner always wins
    expect(plan.dropped.map((d) => d.goal.id)).toEqual(['poor'])
    expect(plan.spend).toBe(100)
  })

  it('defers a goal it can\'t afford yet until the pot grows into it', () => {
    const big = goal({ id: 'big', cost: 200, value: { type: 'flat', rating: 5 } })
    const o: ScheduleOptions = { ...flat(), budgetCurve: [100, 150, 250, 300] }
    const plan = planGoalsScheduled([big], o)

    expect(plan.dropped).toHaveLength(0)
    expect(plan.scheduled).toHaveLength(1)
    expect(plan.scheduled[0].achieveDate).toBe('2028-01-01') // first date pot ≥ 200
  })

  it('defers the densest goal so a second one also fits — beating buy-it-now', () => {
    // Pot ~5×s over the horizon. Buying g1 now drains all future growth and
    // strands g2; waiting one year lets both land, for more total happiness.
    const g1 = goal({ id: 'g1', cost: 100, value: { type: 'flat', rating: 10 } })
    const g2 = goal({ id: 'g2', cost: 100, value: { type: 'flat', rating: 8 } })
    const o: ScheduleOptions = { ...flat(), budgetCurve: [100, 200, 350, 500] }
    const plan = planGoalsScheduled([g1, g2], o)

    expect(plan.scheduled.map((s) => s.goal.id).sort()).toEqual(['g1', 'g2'])
    expect(plan.dropped).toHaveLength(0)
    expect(plan.scheduled.every((s) => s.achieveDate !== NOW)).toBe(true) // both deferred to fit

    // and it genuinely beats spending everything on the densest goal today
    const buyNowOnly = goalHappiness(g1, NOW, o)
    expect(plan.happiness).toBeGreaterThan(buyNowOnly)
  })

  it('schedules free goals immediately and drops worthless ones', () => {
    const free = goal({ id: 'free', cost: 0, value: { type: 'flat', rating: 6 } })
    const worthless = goal({ id: 'worthless', cost: 10, value: { type: 'flat', rating: 0 } })
    const o: ScheduleOptions = { ...flat(), budgetCurve: [100, 100, 100, 100] }
    const plan = planGoalsScheduled([free, worthless], o)

    expect(plan.scheduled.map((s) => s.goal.id)).toEqual(['free'])
    expect(plan.scheduled[0].achieveDate).toBe(NOW)
    expect(plan.dropped.map((d) => [d.goal.id, d.reason])).toEqual([['worthless', 'not-worth-it']])
  })
})

describe('alternative groups & upgrade paths', () => {
  const grid = ['2026-01-01', '2027-01-01', '2028-01-01', '2029-01-01']
  const flat = (): Omit<ScheduleOptions, 'budgetCurve'> => ({
    now: NOW,
    horizon: HORIZON,
    halfLifeMonths: 0,
    grid,
  })
  const group = (over: Partial<GoalGroup> = {}): GoalGroup => ({
    id: 'grp',
    name: 'Phones',
    createdAt: '2026-01-01T00:00:00Z',
    ...over,
  })
  // two competing options sharing a group: cheap-but-modest vs costlier-but-better
  const cheap = () => goal({ id: 'cheap', cost: 100, value: { type: 'flat', rating: 5 }, groupId: 'grp' })
  const premium = () => goal({ id: 'premium', cost: 1000, value: { type: 'flat', rating: 8 }, groupId: 'grp' })

  it('planGoals keeps only the best member of an alternative-set', () => {
    const a = goal({ id: 'a', cost: 100, value: { type: 'flat', rating: 5 }, groupId: 'grp' })
    const b = goal({ id: 'b', cost: 100, value: { type: 'flat', rating: 8 }, groupId: 'grp' })
    const solo = goal({ id: 'solo', cost: 100, value: { type: 'flat', rating: 6 } })
    const plan = planGoals([a, b, solo], 1000, opts)
    // both alternatives are individually affordable, but only the denser one wins its slot
    expect(plan.chosen.map((c) => c.goal.id).sort()).toEqual(['b', 'solo'])
    expect(plan.skipped.map((c) => c.goal.id)).toEqual(['a'])
  })

  it('the scheduled planner picks one alternative and drops the rest as alternatives', () => {
    const a = goal({ id: 'a', cost: 100, value: { type: 'flat', rating: 5 }, groupId: 'grp' })
    const b = goal({ id: 'b', cost: 100, value: { type: 'flat', rating: 8 }, groupId: 'grp' })
    const o: ScheduleOptions = { ...flat(), budgetCurve: [1000, 1000, 1000, 1000], groups: [group()] }
    const plan = planGoalsScheduled([a, b], o)

    expect(plan.scheduled.map((s) => s.goal.id)).toEqual(['b']) // the better option
    expect(plan.scheduled[0].achieveDate).toBe(NOW)
    expect(plan.dropped.map((d) => [d.goal.id, d.reason])).toEqual([['a', 'alternative']])
  })

  it('sequences a cheap→premium upgrade when the pot grows into the costlier option', () => {
    // The pot affords the cheap phone now but not the premium until later. Buying
    // cheap now and upgrading beats waiting with nothing in the interim.
    const o: ScheduleOptions = {
      ...flat(),
      budgetCurve: [900, 1300, 1700, 2100],
      groups: [group({ upgradable: true, upgradeLoss: 0.15 })],
    }
    const plan = planGoalsScheduled([cheap(), premium()], o)

    // both land: cheap held first, then replaced by the premium upgrade
    expect(plan.scheduled.map((s) => s.goal.id).sort()).toEqual(['cheap', 'premium'])
    expect(plan.dropped).toHaveLength(0)

    const cheapRow = plan.scheduled.find((s) => s.goal.id === 'cheap')!
    const premRow = plan.scheduled.find((s) => s.goal.id === 'premium')!
    expect(cheapRow.achieveDate).toBe(NOW)
    expect(premRow.achieveDate).toBe('2027-01-01')
    // the upgrade ties the two rows together
    expect(premRow.upgradeFrom).toBe('cheap')
    expect(cheapRow.until).toBe('2027-01-01') // cheap's worth is counted only up to the swap
    // the premium leg commits only the incremental switch cost: new − resale(old)
    expect(premRow.cost).toBeCloseTo(1000 - 100 * (1 - 0.15), 6) // 915

    // and the upgrade path genuinely beats buying the premium alone
    const premiumOnly = planGoalsScheduled([premium()], { ...o, groups: [group({ upgradable: true })] })
    expect(plan.happiness).toBeGreaterThan(premiumOnly.happiness)
  })

  it('never sequences two members when the group disallows upgrades', () => {
    const o: ScheduleOptions = {
      ...flat(),
      budgetCurve: [900, 1300, 1700, 2100],
      groups: [group({ upgradable: false })],
    }
    const plan = planGoalsScheduled([cheap(), premium()], o)

    // exactly one option taken — the better one, alone — never a sequence
    expect(plan.scheduled).toHaveLength(1)
    expect(plan.scheduled[0].goal.id).toBe('premium')
    expect(plan.scheduled[0].upgradeFrom).toBeUndefined()
    expect(plan.dropped.map((d) => [d.goal.id, d.reason])).toEqual([['cheap', 'alternative']])
  })

  it('caps an upgrade sequence at two members, even with three alternatives', () => {
    // A budget / mid / flagship trio. A sequence is at most one upgrade step, so
    // the plan must never schedule three members of the same group at once.
    const budget = goal({ id: 'budget', cost: 100, value: { type: 'flat', rating: 4 }, groupId: 'grp' })
    const mid = goal({ id: 'mid', cost: 400, value: { type: 'flat', rating: 6 }, groupId: 'grp' })
    const flagship = goal({ id: 'flagship', cost: 1000, value: { type: 'flat', rating: 9 }, groupId: 'grp' })
    const o: ScheduleOptions = {
      ...flat(),
      budgetCurve: [600, 1100, 1600, 2100],
      groups: [group({ upgradable: true })],
    }
    const plan = planGoalsScheduled([budget, mid, flagship], o)

    expect(plan.scheduled.length).toBeLessThanOrEqual(2)
    // whatever lands is a single upgrade pair at most — at least one is dropped as an alternative
    expect(plan.dropped.some((d) => d.reason === 'alternative')).toBe(true)
  })

  it('defaults the upgrade loss when a group leaves it unset', () => {
    const o: ScheduleOptions = {
      ...flat(),
      budgetCurve: [900, 1300, 1700, 2100],
      groups: [group({ upgradable: true })], // no upgradeLoss → DEFAULT_UPGRADE_LOSS
    }
    const plan = planGoalsScheduled([cheap(), premium()], o)
    const premRow = plan.scheduled.find((s) => s.goal.id === 'premium')!
    expect(premRow.cost).toBeCloseTo(1000 - 100 * (1 - DEFAULT_UPGRADE_LOSS), 6)
  })
})
