import { describe, expect, it } from 'vitest'
import { boxPerformanceAt, boxValueAt, goalBudgetCurve, goalFundingBudget, netWorthAt, project } from '../projection'
import type { Box, FinanceState, Transaction, Valuation } from '../types'
import { ActivityStatsModel } from '../../features/transactions/ActivityStatsModel'
import { ActivityLedger } from '../ActivityLedger'

const createdAt = '2026-01-01T00:00:00Z'
const observation = (date: string, value: number): Valuation => ({ id: date, date, value, createdAt })
const investment = (patch: Partial<Box> = {}): Box => ({
  id: 'investment', name: 'Investment', kind: 'investment', currency: 'EUR',
  openingBalance: 1000, openingDate: '2026-01-01', effects: [], color: '#abcdef', createdAt, ...patch,
})
const transaction = (patch: Partial<Transaction>): Transaction => ({
  id: 'deposit', kind: 'transfer', boxId: 'cash', toBoxId: 'investment',
  amount: 200, currency: 'EUR', date: '2026-02-01', createdAt, ...patch,
})
const world = (box: Box, transactions: Transaction[] = []): FinanceState => ({
  boxes: [investment({ id: 'cash', kind: 'checking', openingBalance: 500 }), box], transactions,
  goals: [], goalGroups: [], settings: { baseCurrency: 'EUR', rates: { USD: 0.5 } },
})

describe('investment valuations', () => {
  it('separates deposits, withdrawals, gains, and losses across observations', () => {
    const state = world(investment({ valuations: [observation('2026-02-01', 1320), observation('2026-04-01', 950)] }), [
      transaction({}), transaction({ id: 'withdrawal', boxId: 'investment', toBoxId: 'cash', date: '2026-03-01', amount: 100 }),
    ])
    expect(boxPerformanceAt(state, 'investment', '2026-02-01')).toEqual({ value: 1320, netContributions: 1200, gain: 120 })
    expect(boxPerformanceAt(state, 'investment', '2026-03-01')).toEqual({ value: 1220, netContributions: 1100, gain: 120 })
    expect(boxPerformanceAt(state, 'investment', '2026-04-01')).toEqual({ value: 950, netContributions: 1100, gain: -150 })
    expect(netWorthAt(state, '2026-04-01')).toBe(1350)
  })

  it('does not route a gain to another box even when the investment spills all deposits', () => {
    const state = world(investment({
      acceptance: [{ level: 0, rate: 0 }], forwards: [{ id: 'spill', toBoxId: 'cash', share: 1 }],
      valuations: [observation('2026-02-01', 1400)],
    }), [transaction({})])
    expect(boxPerformanceAt(state, 'investment', '2026-02-01')).toEqual({ value: 1400, netContributions: 1000, gain: 400 })
    expect(boxValueAt(state, 'cash', '2026-02-01')).toBe(500)
    expect(netWorthAt(state, '2026-02-01')).toBe(1900)
  })

  it('counts forwarded contributions only where they are retained, including currency conversion', () => {
    const state = world(investment({ currency: 'USD', openingBalance: 100, valuations: [observation('2026-02-01', 150)] }), [
      transaction({ kind: 'income', toBoxId: undefined, boxId: 'cash', amount: 20 }),
    ])
    state.boxes[0].acceptance = [{ level: 0, rate: 0 }]
    state.boxes[0].forwards = [{ id: 'forward', toBoxId: 'investment', share: 1 }]
    expect(boxPerformanceAt(state, 'investment', '2026-02-01')).toEqual({ value: 150, netContributions: 140, gain: 10 })
    expect(netWorthAt(state, '2026-02-01')).toBe(575)
  })

  it('uses the observation as a fresh forecast anchor without double counting growth', () => {
    const state = world(investment({
      effects: [{ id: 'growth', kind: 'appreciation', annualRate: 0.1, compounding: 'annually' }],
      valuations: [observation('2030-01-01', 900)],
    }))
    expect(boxValueAt(state, 'investment', '2030-01-01')).toBe(900)
    expect(boxValueAt(state, 'investment', '2034-01-01')).toBeCloseTo(900 * 1.1 ** 4)
    const result = project(state, { from: '2030-01-01', to: '2034-01-01', steps: 7 })
    expect(result.currentNominal).toBe(1400)
    expect(result.endNominal).toBeCloseTo(500 + 900 * 1.1 ** 4)
  })

  it('updates the funding pool and preserves gain when a goal withdraws money later', () => {
    const state = world(investment({ fundsGoals: true, valuations: [observation('2026-02-01', 1300)] }))
    expect(goalFundingBudget(state, '2026-02-01')).toBe(1300)
    expect(goalBudgetCurve(state, ['2026-01-01', '2026-02-01'])).toEqual([1000, 1300])
    const planned = [{ id: 'goal', label: 'Buy', date: '2026-03-01', cost: 300, color: '#abcdef', createdAt }]
    expect(boxPerformanceAt(state, 'investment', '2026-03-01', planned)).toEqual({ value: 1000, netContributions: 700, gain: 300 })
    state.goals = [{ id: 'done', name: 'Buy', cost: 300, value: { type: 'flat', rating: 50 }, status: 'done', doneDate: '2026-03-01', color: '#abcdef', createdAt }]
    expect(goalFundingBudget(state, '2026-03-01')).toBe(1000)
    expect(boxPerformanceAt(state, 'investment', '2026-03-01').gain).toBe(300)
  })

  it('keeps observations out of income, spending, and savings statistics', () => {
    const state = world(investment({ valuations: [observation('2026-02-01', 1300), observation('2026-03-01', 800)] }), [
      transaction({}), transaction({ id: 'salary', kind: 'income', boxId: 'cash', amount: 400 }),
      transaction({ id: 'spending', kind: 'expense', boxId: 'cash', amount: 50 }),
    ])
    const stats = new ActivityStatsModel(state, '2026-01-01', '2026-04-01')
    expect(stats.income).toBe(400)
    expect(stats.spending).toBe(50)
    expect(stats.entries).toHaveLength(2)
    expect(stats.savingsRate).toBe(87.5)
  })

  it('preserves history, supports total loss and recovery, and ignores pre-opening observations', () => {
    const state = world(investment({ valuations: [
      observation('2025-12-01', 9000), observation('2026-02-01', 0), observation('2026-03-01', 100),
    ] }))
    expect(boxPerformanceAt(state, 'investment', '2025-12-31')).toEqual({ value: 0, netContributions: 0, gain: 0 })
    expect(boxValueAt(state, 'investment', '2026-01-01')).toBe(1000)
    expect(boxPerformanceAt(state, 'investment', '2026-02-01')).toEqual({ value: 0, netContributions: 1000, gain: -1000 })
    expect(boxValueAt(state, 'investment', '2026-03-01')).toBe(100)
  })

  it('applies recurring contributions after a valuation without treating them as growth', () => {
    const state = world(investment({ valuations: [observation('2026-02-01', 1300)] }), [transaction({
      recurrence: { every: 1, unit: 'month', anchor: '2026-02-01', end: { type: 'never' } },
    })])
    expect(boxPerformanceAt(state, 'investment', '2026-04-01')).toEqual({ value: 1700, netContributions: 1600, gain: 100 })
  })

  it('keeps blueprint contributions aligned with value updates and their history', () => {
    const state = world(investment({ valuations: [observation('2026-02-01', 1300)] }))
    const recurring = transaction({ recurrence: { every: 1, unit: 'month', anchor: '2026-02-01', end: { type: 'never' } } })
    const ledger = new ActivityLedger(state)
    const blueprint = ActivityLedger.blueprint(recurring)
    state.activityBlueprints = [ledger.revise(blueprint, { amount: 300 }, '2026-03-01')]
    expect(boxPerformanceAt(state, 'investment', '2026-02-01')).toEqual({ value: 1300, netContributions: 1200, gain: 100 })
    expect(boxPerformanceAt(state, 'investment', '2026-04-01')).toEqual({ value: 1900, netContributions: 1800, gain: 100 })
  })

  it('recomputes history when observations are corrected or removed', () => {
    const state = world(investment({ valuations: [observation('2026-02-01', 1200)] }))
    expect(boxValueAt(state, 'investment', '2026-02-01')).toBe(1200)
    state.boxes[1].valuations![0].value = 1100
    expect(boxPerformanceAt(state, 'investment', '2026-02-01').gain).toBe(100)
    state.boxes[1].valuations = []
    expect(boxPerformanceAt(state, 'investment', '2026-02-01').gain).toBe(0)
  })
})
