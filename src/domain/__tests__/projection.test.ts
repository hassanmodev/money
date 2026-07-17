import { describe, expect, it } from 'vitest'
import { planGoalsScheduled } from '../goals'
import {
  boxValueAt,
  goalBudgetCurve,
  goalFundingBudget,
  netWorthAt,
  project,
  type PlannedBuy,
} from '../projection'
import type { Box, Effect, FinanceState, Goal, Settings, Transaction } from '../types'

const settings: Settings = { baseCurrency: 'EUR', rates: { USD: 0.9 } }

let n = 0
const box = (b: Partial<Box>): Box => ({
  id: `b${n++}`,
  name: 'Box',
  kind: 'cash',
  currency: 'EUR',
  openingBalance: 0,
  openingDate: '2026-01-01',
  color: '#d4845c',
  effects: [],
  createdAt: '2026-01-01T00:00:00Z',
  ...b,
})

const interest = (rate: number): Effect => ({
  id: 'i',
  kind: 'interest',
  annualRate: rate,
  compounding: 'annually',
})

const state = (boxes: Box[], transactions: Transaction[] = [], goals: FinanceState['goals'] = []): FinanceState => ({
  boxes,
  transactions,
  goals,
  goalGroups: [],
  settings,
})

// 2026-01-01 → 2030-01-01 spans exactly 1461 days = 4.000 years (2028 is a leap year).
const FOUR_YEARS = { from: '2026-01-01', to: '2030-01-01' }

describe('compound growth', () => {
  it('grows a box by (1+r)^t over the horizon', () => {
    const r = project(
      state([box({ openingBalance: 1000, effects: [interest(0.12)] })]),
      FOUR_YEARS,
    )
    expect(r.currentNominal).toBeCloseTo(1000, 6)
    expect(r.endNominal).toBeCloseTo(1000 * 1.12 ** 4, 2) // 1573.52
  })
})

describe('recurring expense drawdown', () => {
  it('subtracts each occurrence with no growth on a plain cash box', () => {
    const b = box({ openingBalance: 1000 })
    const tx: Transaction = {
      id: 't1',
      kind: 'expense',
      boxId: b.id,
      amount: 100,
      currency: 'EUR',
      date: '2026-01-01',
      createdAt: '2026-01-01T00:00:00Z',
      recurrence: {
        every: 1,
        unit: 'month',
        anchor: '2026-01-01',
        end: { type: 'after', count: 5 },
      },
    }
    const r = project(state([b], [tx]), { from: '2026-01-01', to: '2026-12-31' })
    expect(r.currentNominal).toBeCloseTo(900, 6) // same-day expense already applied
    expect(r.endNominal).toBeCloseTo(500, 6) // 1000 - 5×100
  })

  it('accrues a weekly amount as daily fractions when selected', () => {
    const b = box({ openingBalance: 1000 })
    const tx: Transaction = {
      id: 'daily-accrual',
      kind: 'expense',
      boxId: b.id,
      amount: 70,
      currency: 'EUR',
      date: '2026-01-01',
      createdAt: '2026-01-01T00:00:00Z',
      recurrence: {
        every: 1,
        unit: 'week',
        anchor: '2026-01-01',
        end: { type: 'after', count: 2 },
        dailyAccrual: true,
      },
    }

    const world = state([b], [tx])
    expect(netWorthAt(world, '2026-01-01')).toBeCloseTo(990, 6)
    expect(netWorthAt(world, '2026-01-07')).toBeCloseTo(930, 6)
    expect(netWorthAt(world, '2026-01-14')).toBeCloseTo(860, 6)
  })

  it('income lifts the destination box', () => {
    const b = box({ openingBalance: 0 })
    const tx: Transaction = {
      id: 't2',
      kind: 'income',
      boxId: b.id,
      amount: 250,
      currency: 'EUR',
      date: '2026-02-01',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const r = project(state([b], [tx]), { from: '2026-01-01', to: '2026-06-01' })
    expect(r.endNominal).toBeCloseTo(250, 6)
  })
})

describe('transfers', () => {
  it('moves value between boxes, converting currency', () => {
    const eur = box({ currency: 'EUR', openingBalance: 1000 })
    const usd = box({ currency: 'USD', openingBalance: 0 })
    const tx: Transaction = {
      id: 't3',
      kind: 'transfer',
      boxId: eur.id,
      toBoxId: usd.id,
      amount: 90, // 90 EUR
      currency: 'EUR',
      date: '2026-03-01',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const world = state([eur, usd], [tx])
    const value = netWorthAt(world, '2026-06-01')
    expect(value).toBeCloseTo(1000, 6) // value is conserved across the transfer
    // the USD box now holds 100 USD (= 90 EUR at rate 0.9)
    expect(boxValueAt(world, usd.id, '2026-06-01')).toBeCloseTo(100, 6)
  })
})

describe('multi-currency net worth', () => {
  it('rolls boxes up into the base currency', () => {
    const eur = box({ currency: 'EUR', openingBalance: 100 })
    const usd = box({ currency: 'USD', openingBalance: 1000 }) // = 900 EUR
    const r = project(state([eur, usd]), FOUR_YEARS)
    expect(r.currentNominal).toBeCloseTo(1000, 6)
  })
})

describe('inflation (real vs nominal)', () => {
  it('leaves nominal alone but erodes real purchasing power', () => {
    const r = project(
      state([
        box({
          openingBalance: 1000,
          effects: [{ id: 'inf', kind: 'inflation', annualRate: 0.03, compounding: 'annually' }],
        }),
      ]),
      FOUR_YEARS,
    )
    expect(r.endNominal).toBeCloseTo(1000, 6)
    expect(r.endReal).toBeCloseTo(1000 / 1.03 ** 4, 4) // ≈ 888.49
  })
})

describe('forwarding', () => {
  it('spills a share of inflow on to another box, conserving net worth', () => {
    // checking keeps 50% of what arrives and forwards the rest to savings
    const checking = box({
      id: 'chk',
      openingBalance: 0,
      acceptance: [{ level: 0, rate: 0.5 }],
      forwards: [{ id: 'f1', toBoxId: 'sav', share: 1 }],
    })
    const savings = box({ id: 'sav', openingBalance: 0 })
    const income: Transaction = {
      id: 'inc',
      kind: 'income',
      boxId: 'chk',
      amount: 1000,
      currency: 'EUR',
      date: '2026-01-15',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const world = state([checking, savings], [income])
    expect(boxValueAt(world, 'chk', '2026-02-01')).toBeCloseTo(500, 6)
    expect(boxValueAt(world, 'sav', '2026-02-01')).toBeCloseTo(500, 6)
    expect(netWorthAt(world, '2026-02-01')).toBeCloseTo(1000, 6) // nothing lost
  })

  it('caps a box and overflows the surplus', () => {
    // checking holds at most 1000, the rest spills to savings
    const checking = box({
      id: 'chk',
      openingBalance: 0,
      acceptance: [{ level: 1000, rate: 0 }],
      forwards: [{ id: 'f1', toBoxId: 'sav', share: 1 }],
    })
    const savings = box({ id: 'sav', openingBalance: 0 })
    const income: Transaction = {
      id: 'inc',
      kind: 'income',
      boxId: 'chk',
      amount: 2500,
      currency: 'EUR',
      date: '2026-01-15',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const world = state([checking, savings], [income])
    expect(boxValueAt(world, 'chk', '2026-02-01')).toBeCloseTo(1000, 6)
    expect(boxValueAt(world, 'sav', '2026-02-01')).toBeCloseTo(1500, 6)
  })
})

describe('achieved goals draw down net worth', () => {
  const goal = (g: Partial<Goal>): Goal => ({
    id: 'goal',
    name: 'Trip',
    cost: 300,
    value: { type: 'flat', rating: 7 },
    status: 'done',
    doneDate: '2026-03-01',
    color: '#9eb87f',
    createdAt: '2026-01-01T00:00:00Z',
    ...g,
  })

  it('subtracts a done goal from the funding pool', () => {
    const sav = box({ id: 'sav', openingBalance: 1000, fundsGoals: true })
    const world = state([sav], [], [goal({})])
    expect(netWorthAt(world, '2026-02-01')).toBeCloseTo(1000, 6) // before it's achieved
    expect(netWorthAt(world, '2026-06-01')).toBeCloseTo(700, 6) // 1000 − 300
    expect(boxValueAt(world, 'sav', '2026-06-01')).toBeCloseTo(700, 6)
  })

  it('splits the spend evenly across the pool boxes', () => {
    const a = box({ id: 'a', openingBalance: 500, fundsGoals: true })
    const b = box({ id: 'b', openingBalance: 500, fundsGoals: true })
    const world = state([a, b], [], [goal({ cost: 400 })])
    expect(boxValueAt(world, 'a', '2026-06-01')).toBeCloseTo(300, 6) // 500 − 200
    expect(boxValueAt(world, 'b', '2026-06-01')).toBeCloseTo(300, 6)
  })

  it('draws nothing when no box funds goals — goals are advisory only', () => {
    const sav = box({ id: 'sav', openingBalance: 1000 })
    const world = state([sav], [], [goal({})])
    expect(netWorthAt(world, '2026-06-01')).toBeCloseTo(1000, 6)
  })

  it('only pool boxes are drawn down, not bystanders', () => {
    const sav = box({ id: 'sav', openingBalance: 1000, fundsGoals: true })
    const other = box({ id: 'other', openingBalance: 500 })
    const world = state([sav, other], [], [goal({})])
    expect(boxValueAt(world, 'sav', '2026-06-01')).toBeCloseTo(700, 6) // 1000 − 300
    expect(boxValueAt(world, 'other', '2026-06-01')).toBeCloseTo(500, 6) // untouched
  })

  it('open and shelved goals never touch the projection', () => {
    const sav = box({ id: 'sav', openingBalance: 1000, fundsGoals: true })
    const world = state([sav], [], [
      goal({ id: 'g1', status: 'open' }),
      goal({ id: 'g2', status: 'dismissed' }),
    ])
    expect(netWorthAt(world, '2026-06-01')).toBeCloseTo(1000, 6)
  })

  it('surfaces achieved goals as markers within the horizon', () => {
    const sav = box({ id: 'sav', openingBalance: 1000, fundsGoals: true })
    const world = state([sav], [], [goal({})])
    const r = project(world, { from: '2026-01-01', to: '2026-12-31' })
    expect(r.markers).toHaveLength(1)
    expect(r.markers[0]).toMatchObject({ id: 'goal', date: '2026-03-01', cost: 300 })
  })
})

describe('planned buys forecast onto the projection', () => {
  const planned: PlannedBuy = {
    id: 'p1',
    label: 'Trip',
    date: '2027-01-01',
    cost: 300,
    color: '#9eb87f',
    createdAt: '2026-01-01T00:00:00Z',
  }

  it('deducts a planned buy at its date, like an achieved goal would', () => {
    const sav = box({ id: 'sav', openingBalance: 1000, fundsGoals: true })
    const world = state([sav])
    // no forecast passed → the open buy is invisible, money stays put
    expect(netWorthAt(world, '2027-06-01')).toBeCloseTo(1000, 6)
    // with the forecast → nothing before its date, deducted from its date on
    expect(netWorthAt(world, '2026-06-01', [planned])).toBeCloseTo(1000, 6)
    expect(netWorthAt(world, '2027-06-01', [planned])).toBeCloseTo(700, 6)
    expect(boxValueAt(world, 'sav', '2027-06-01', [planned])).toBeCloseTo(700, 6)
  })

  it('draws nothing when no box funds goals — a forecast is still advisory', () => {
    const plain = box({ id: 'plain', openingBalance: 1000 }) // fundsGoals not set
    expect(netWorthAt(state([plain]), '2027-06-01', [planned])).toBeCloseTo(1000, 6)
  })

  it('surfaces planned buys as distinct (planned) markers', () => {
    const sav = box({ id: 'sav', openingBalance: 1000, fundsGoals: true })
    const r = project(state([sav]), { from: '2026-01-01', to: '2028-01-01' }, [planned])
    const m = r.markers.find((x) => x.planned)
    expect(m).toMatchObject({ label: 'Trip', date: '2027-01-01', cost: 300, planned: true })
  })
})

describe('goal funding spendable cap', () => {
  const poolBox = () => box({ id: 'sav', openingBalance: 1000, fundsGoals: true })
  const withSettings = (patch: Partial<Settings>): FinanceState => ({
    ...state([poolBox()]),
    settings: { ...settings, ...patch },
  })

  it('defaults to the full pool when caps are unset', () => {
    const world = state([poolBox()])
    expect(goalFundingBudget(world, '2026-06-01')).toBeCloseTo(1000, 6)
    expect(goalBudgetCurve(world, ['2026-06-01'])[0]).toBeCloseTo(1000, 6)
  })

  it('aside only: pool − aside, floored at 0', () => {
    expect(goalFundingBudget(withSettings({ goalBudgetAside: 300 }), '2026-06-01')).toBeCloseTo(700, 6)
    expect(goalFundingBudget(withSettings({ goalBudgetAside: 1500 }), '2026-06-01')).toBe(0)
  })

  it('% only: pool × percent', () => {
    expect(goalFundingBudget(withSettings({ goalBudgetSpendPercent: 0.7 }), '2026-06-01')).toBeCloseTo(700, 6)
  })

  it('both: min(pool × %, pool − aside)', () => {
    // pool=1000 → 70%=700, aside 100 → 900 → min = 700
    expect(
      goalFundingBudget(withSettings({ goalBudgetSpendPercent: 0.7, goalBudgetAside: 100 }), '2026-06-01'),
    ).toBeCloseTo(700, 6)
    // pool=1000 → 90%=900, aside 400 → 600 → min = 600
    expect(
      goalFundingBudget(withSettings({ goalBudgetSpendPercent: 0.9, goalBudgetAside: 400 }), '2026-06-01'),
    ).toBeCloseTo(600, 6)
  })

  it('goalBudgetCurve applies the same cap on every grid date', () => {
    const world = withSettings({ goalBudgetSpendPercent: 0.5, goalBudgetAside: 200 })
    const curve = goalBudgetCurve(world, ['2026-01-01', '2026-06-01'])
    // min(1000×0.5, 1000−200) = 500
    expect(curve[0]).toBeCloseTo(500, 6)
    expect(curve[1]).toBeCloseTo(500, 6)
  })

  it('planner spend never exceeds the capped spendable budget', () => {
    const world = withSettings({ goalBudgetAside: 400 }) // spendable 600
    const budget = goalFundingBudget(world, '2026-01-01')
    expect(budget).toBeCloseTo(600, 6)
    const curve = goalBudgetCurve(world, ['2026-01-01', '2027-01-01', '2028-01-01'])
    const g1: Goal = {
      id: 'g1',
      name: 'A',
      cost: 400,
      value: { type: 'flat', rating: 80 },
      status: 'open',
      color: '#9eb87f',
      createdAt: '2026-01-01T00:00:00Z',
    }
    const g2: Goal = { ...g1, id: 'g2', name: 'B', cost: 400, value: { type: 'flat', rating: 70 } }
    const plan = planGoalsScheduled([g1, g2], {
      now: '2026-01-01',
      horizon: '2029-01-01',
      halfLifeMonths: 0,
      grid: ['2026-01-01', '2027-01-01', '2028-01-01'],
      budgetCurve: curve,
    })
    expect(plan.spend).toBeLessThanOrEqual(budget + 1e-9)
    expect(plan.spend).toBe(400)
    expect(plan.dropped.map((d) => d.goal.id)).toEqual(['g2'])
  })
})
