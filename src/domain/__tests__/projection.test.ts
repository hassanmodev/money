import { describe, expect, it } from 'vitest'
import { boxValueAt, netWorthAt, project } from '../projection'
import type { Box, Effect, FinanceState, Settings, Transaction } from '../types'

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

const state = (boxes: Box[], transactions: Transaction[] = []): FinanceState => ({
  boxes,
  transactions,
  goals: [],
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

describe('milestones', () => {
  it('flags when a goal target is first reached', () => {
    const s: FinanceState = {
      ...state([box({ openingBalance: 1000, effects: [interest(0.2)] })]),
      goals: [
        {
          id: 'g1',
          label: 'First 2k',
          cost: 2000,
          value: 5,
          boxIds: [],
          status: 'open',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    }
    const r = project(s, { from: '2026-01-01', to: '2036-01-01' })
    const goal = r.milestones.find((m) => m.id === 'goal-g1')
    expect(goal).toBeDefined()
    expect(goal!.value).toBe(2000)
  })
})
