import { describe, expect, it } from 'vitest'
import type { FinanceState, Transaction } from '@/domain/types'
import { ActivityStatsModel } from './ActivityStatsModel'

const tx = (values: Partial<Transaction>): Transaction => ({
  id: 'expense', kind: 'expense', amount: 100, currency: 'EUR',
  boxId: 'cash', date: '2026-01-15', createdAt: '', ...values,
})
const state = (transactions: Transaction[]): FinanceState => ({
  transactions, boxes: [], goals: [], goalGroups: [],
  settings: { baseCurrency: 'EUR', rates: { USD: 0.5 } },
})

describe('activity statistics', () => {
  it('includes both boundary dates, converts currencies, and ignores transfers', () => {
    const stats = new ActivityStatsModel(state([
      tx({ kind: 'income', amount: 1000, date: '2026-01-01' }),
      tx({ amount: 200, currency: 'USD', date: '2026-01-31' }),
      tx({ kind: 'transfer', amount: 500 }),
      tx({ date: '2025-12-31' }),
      tx({ date: '2026-02-01' }),
    ]), '2026-01-01', '2026-01-31')
    expect(stats.income).toBe(1000)
    expect(stats.spending).toBe(100)
    expect(stats.days).toBe(31)
    expect(stats.savingsRate).toBe(90)
    expect(stats.average(stats.left, 7)).toBeCloseTo(900 / 31 * 7)
  })

  it('expands recurring entries and daily accrual for a partial period', () => {
    const stats = new ActivityStatsModel(state([
      tx({ kind: 'income', amount: 3100, recurrence: {
        every: 1, unit: 'month', anchor: '2026-01-01', end: { type: 'never' }, dailyAccrual: true,
      } }),
      tx({ amount: 10, recurrence: {
        every: 1, unit: 'day', anchor: '2026-01-01', end: { type: 'after', count: 12 },
      } }),
    ]), '2026-01-11', '2026-01-15')
    expect(stats.income).toBe(500)
    expect(stats.spending).toBe(20)
    expect(stats.purchases).toHaveLength(0)
    expect(stats.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'income', amount: 500, count: 5, date: '2026-01-11', lastDate: '2026-01-15', cadence: 'Daily accrual', excluded: false }),
      expect.objectContaining({ kind: 'expense', amount: 20, count: 2, date: '2026-01-11', lastDate: '2026-01-12', excluded: false }),
    ]))
  })

  it('keeps full totals when unusual purchases and goals are automatically set aside', () => {
    const data = state([tx({ amount: 500 }), tx({ amount: 40, date: '2025-12-01' }), tx({ amount: 50, date: '2025-12-02' }), tx({ amount: 60, date: '2025-12-03' })])
    data.goals.push({ id: 'goal', name: 'Laptop', cost: 1000, status: 'done',
      doneDate: '2026-01-20', color: '', createdAt: '', value: { type: 'flat', rating: 50 } })
    const stats = new ActivityStatsModel(data, '2026-01-01', '2026-01-31', 5, [
      { id: 'plan', label: 'Desk', cost: 200, date: '2026-01-25', color: '', createdAt: '' },
      { id: 'later', label: 'Later', cost: 900, date: '2026-02-01', color: '', createdAt: '' },
    ])
    expect(stats.spending).toBe(1700)
    expect(stats.excluded).toBe(1500)
    expect(stats.left).toBe(-200)
    expect(stats.savingsRate).toBeNull()
    expect(stats.purchases).toHaveLength(3)
    expect(stats.entries.filter((entry) => entry.excluded).reduce((sum, entry) => sum + entry.amount, 0)).toBe(stats.excluded)
    expect(stats.entries.filter((entry) => !entry.excluded).reduce((sum, entry) => sum + entry.amount, 0)).toBe(stats.adjustedSpending)
  })

  it('handles an empty range and a single day without dividing by zero', () => {
    const stats = new ActivityStatsModel(state([]), '2026-01-01', '2026-01-01')
    expect(stats.days).toBe(1)
    expect(stats.average(stats.left, 1)).toBe(0)
    expect(stats.savingsRate).toBeNull()
  })

  it('filters several big purchases without filtering rent or changing full totals', () => {
    const data = state([
      tx({ amount: 20 }), tx({ amount: 30 }), tx({ amount: 40 }),
      tx({ amount: 50 }), tx({ amount: 60 }),
      tx({ amount: 1500 }), tx({ amount: 2000 }),
      tx({ amount: 1200, recurrence: {
        every: 1, unit: 'month', anchor: '2026-01-01', end: { type: 'never' },
      } }),
    ])
    const stats = new ActivityStatsModel(data, '2026-01-01', '2026-01-31', 5)
    expect(stats.excluded).toBe(3500)
    expect(stats.adjustedSpending).toBe(1400)
    expect(stats.spending).toBe(4900)
    const unfiltered = new ActivityStatsModel(data, '2026-01-01', '2026-01-31')
    expect(unfiltered.excluded).toBe(0)
    expect(unfiltered.left).toBe(-4900)
  })

  it('keeps the threshold stable across range lengths and allows sensitivity changes', () => {
    const data = state([
      tx({ amount: 20, date: '2025-12-01' }), tx({ amount: 30, date: '2025-12-02' }),
      tx({ amount: 40, date: '2025-12-03' }), tx({ amount: 300 }),
    ])
    const month = new ActivityStatsModel(data, '2026-01-01', '2026-01-31', 5)
    const year = new ActivityStatsModel(data, '2025-02-01', '2026-01-31', 5)
    const relaxed = new ActivityStatsModel(data, '2026-01-01', '2026-01-31', 10)
    expect(month.threshold).toBe(year.threshold)
    expect(month.excluded).toBe(300)
    expect(relaxed.excluded).toBe(0)
  })

  it('keeps purchases when there is too little history to infer what is usual', () => {
    const stats = new ActivityStatsModel(state([tx({ amount: 2000 })]), '2026-01-01', '2026-01-31', 5)
    expect(stats.threshold).toBeNull()
    expect(stats.excluded).toBe(0)
  })
})
