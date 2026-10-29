import { describe, expect, it } from 'vitest'
import { ActivityLedger } from '../ActivityLedger'
import { netWorthAt } from '../projection'
import { ActivityStatsModel } from '@/features/transactions/ActivityStatsModel'
import { applyScenario, newScenario } from '@/features/planning/scenario'
import type { FinanceState, Transaction } from '../types'

const recurring = (patch: Partial<Transaction> = {}): Transaction => ({
  id: 'rent', kind: 'expense', amount: 100, currency: 'EUR', boxId: 'cash',
  date: '2026-01-01', createdAt: '2026-01-01T00:00:00Z',
  recurrence: { anchor: '2026-01-01', every: 1, unit: 'month', end: { type: 'never' } }, ...patch,
})

const world = (): FinanceState => ({
  boxes: [{ id: 'cash', name: 'Cash', kind: 'cash', currency: 'EUR', openingBalance: 1000,
    openingDate: '2026-01-01', effects: [], color: '', createdAt: '' }],
  ...new ActivityLedger({ transactions: [recurring()] }).migrate(),
  goals: [], goalGroups: [], settings: { baseCurrency: 'EUR', rates: {} },
})

describe('activity blueprints', () => {
  it('migrates recurring entries without changing balances or losing one-offs', () => {
    const data = world()
    const old = { ...data, activityBlueprints: [], transactions: [recurring()] }
    expect(netWorthAt(data, '2026-03-31')).toBe(netWorthAt(old, '2026-03-31'))
    const oneOff = recurring({ id: 'once', recurrence: undefined })
    const migrated = new ActivityLedger({ transactions: [recurring(), oneOff] }).migrate()
    expect(migrated.transactions).toEqual([oneOff])
    const entries = new ActivityLedger(migrated).between('2026-02-01', '2026-03-01')
    expect(entries.map((tx) => [tx.id, tx.blueprintId, tx.amount])).toEqual([
      ['rent:2026-02-01', 'rent', 100], ['rent:2026-03-01', 'rent', 100],
    ])
  })

  it('preserves history when amount and schedule change, including repeated edits', () => {
    const data = world()
    const ledger = new ActivityLedger(data)
    let blueprint = ledger.revise(data.activityBlueprints![0], { amount: 200 }, '2026-02-01')
    blueprint = ledger.revise(blueprint, { amount: 250 }, '2026-02-01')
    blueprint = ledger.revise(blueprint, { amount: 300, recurrence: {
      anchor: '2026-03-15', every: 1, unit: 'month', end: { type: 'after', count: 2 },
    } }, '2026-03-01')
    data.activityBlueprints = [blueprint]
    const entries = new ActivityLedger(data).between('2026-01-01', '2026-05-31')
    expect(entries.map((tx) => [tx.date, tx.amount])).toEqual([
      ['2026-01-01', 100], ['2026-02-01', 250], ['2026-03-15', 300], ['2026-04-15', 300],
    ])
    expect(netWorthAt(data, '2026-02-28')).toBe(650)
    expect(netWorthAt(data, '2026-05-31')).toBe(50)
    expect(new ActivityStatsModel(data, '2026-01-01', '2026-05-31').spending).toBe(950)
    expect(new ActivityStatsModel(data, '2026-01-01', '2026-05-31').entries[0].count).toBe(4)
    expect(new ActivityLedger(JSON.parse(JSON.stringify(data))).between('2026-01-01', '2026-05-31')).toEqual(entries)
  })

  it('keeps edited, moved, and deleted occurrences independent of the blueprint', () => {
    const data = world()
    const [february] = new ActivityLedger(data).between('2026-02-01', '2026-02-01')
    data.transactions = [{ ...february, date: '2026-03-10', amount: 75 }]
    data.activityBlueprints![0].skippedDates = ['2026-03-01']
    expect(new ActivityLedger(data).between('2026-02-01', '2026-02-28')).toEqual([])
    expect(new ActivityLedger(data).between('2026-03-01', '2026-03-31')).toEqual(data.transactions)
    expect(new ActivityStatsModel(data, '2026-01-01', '2026-03-31').spending).toBe(175)
    expect(netWorthAt(data, '2026-03-31')).toBe(825)
  })

  it('stops future activity while retaining previous occurrences', () => {
    const data = world()
    data.activityBlueprints![0].stoppedOn = '2026-02-01'
    expect(new ActivityLedger(data).current()).toEqual([])
    expect(new ActivityLedger(data).between('2026-01-01', '2026-12-31').map((tx) => tx.date)).toEqual(['2026-01-01'])
    expect(netWorthAt(data, '2026-12-31')).toBe(900)
  })

  it('preserves daily accrual before a mid-period amount change', () => {
    const tx = recurring({ amount: 310, recurrence: {
      anchor: '2026-01-01', every: 1, unit: 'month', end: { type: 'never' }, dailyAccrual: true,
    } })
    const ledger = new ActivityLedger({ transactions: [] })
    const blueprint = ledger.revise(ActivityLedger.blueprint(tx), { amount: 620 }, '2026-01-16')
    const entries = new ActivityLedger({ transactions: [], activityBlueprints: [blueprint] }).between('2026-01-01', '2026-01-31')
    expect(entries).toHaveLength(31)
    expect(entries.slice(0, 15).every((tx) => tx.amount === 10)).toBe(true)
    expect(entries.slice(15).every((tx) => tx.amount === 20)).toBe(true)
  })

  it('applies planning scenarios to blueprints', () => {
    const data = world()
    const scenario = newScenario('Raise expenses')
    scenario.bulk.expense = 25
    const next = applyScenario(data, scenario)
    expect(new ActivityLedger(next).current()[0].amount).toBe(125)
    expect(new ActivityLedger(data).current()[0].amount).toBe(100)
  })
})
