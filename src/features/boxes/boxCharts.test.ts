import { describe, expect, it } from 'vitest'
import type { Box, FinanceState } from '@/domain'
import { buildBoxCharts } from './buildBoxCharts'

const box = (id: string, currency: string, openingBalance: number, extra: Partial<Box> = {}): Box => ({
  id, name: id, currency, openingBalance, kind: 'checking', openingDate: '2026-01-01',
  color: '#d4845c', effects: [], createdAt: '2026-01-01T00:00:00Z', ...extra,
})
const state = (boxes: Box[]): FinanceState => ({
  boxes, transactions: [], goals: [], goalGroups: [],
  settings: { baseCurrency: 'EUR', rates: { USD: 0.5 } },
})

describe('box chart adapter', () => {
  it('groups native balances and converts positive holdings for comparable currency shares', () => {
    const data = state([
      box('bank', 'USD', 200), box('cash', 'EUR', 50), box('wallet', 'USD', 100),
      box('overdraft', 'USD', -20), box('old', 'USD', 999, { archived: true }),
    ])
    const groups = buildBoxCharts(data, '2026-01-01')
    expect(groups.map((group) => group.currency)).toEqual(['EUR', 'USD'])
    expect(groups[1].total).toBe(280)
    expect(groups[1].accounts.map((point) => point.value)).toEqual([200, 100, -20])
    expect(groups.map((group) => group.point.value)).toEqual([50, 150])
    expect(groups[0].point.color).not.toBe(groups[1].point.color)
    expect(buildBoxCharts({ ...data, boxes: [...data.boxes].reverse() }, '2026-01-01')[1].point.color)
      .toBe(groups[1].point.color)
  })

  it('keeps native accounts when conversion rates are missing or invalid', () => {
    const data = state([box('custom', 'TOKEN', 5), box('dollars', 'USD', 10)])
    data.settings.rates.USD = 0
    const groups = buildBoxCharts(data, '2026-01-01')
    expect(groups.map((group) => group.point.value)).toEqual([null, null])
    expect(groups.map((group) => group.accounts[0].value)).toEqual([5, 10])
  })

  it('uses the selected date, transactions, and supplied planned purchases', () => {
    const data = state([box('bank', 'EUR', 100, { fundsGoals: true })])
    data.transactions.push({
      id: 'income', kind: 'income', boxId: 'bank', amount: 20, currency: 'EUR',
      date: '2026-02-01', createdAt: '2026-01-01T00:00:00Z',
    })
    const planned = [{ id: 'goal', label: 'Goal', date: '2026-03-01', cost: 30, color: '#fff', createdAt: '2026-01-01T00:00:00Z' }]
    expect(buildBoxCharts(data, '2026-01-01', planned)[0].total).toBe(100)
    expect(buildBoxCharts(data, '2026-02-01', planned)[0].total).toBe(120)
    expect(buildBoxCharts(data, '2026-03-01', planned)[0].total).toBe(90)
    expect(buildBoxCharts(data, '2026-03-01')[0].total).toBe(120)
  })

  it('has no currency groups for an empty world', () => {
    expect(buildBoxCharts(state([]), '2026-01-01')).toEqual([])
  })

  it('groups assets separately even when they share account currencies', () => {
    const data = state([
      box('cash', 'EUR', 50), box('bank', 'USD', 200),
      box('laptop', 'EUR', 1000, { kind: 'asset' }),
      box('camera', 'USD', 400, { kind: 'asset' }),
      box('old-asset', 'EUR', 999, { kind: 'asset', archived: true }),
    ])
    const groups = buildBoxCharts(data, '2030-01-01')
    expect(groups.map((group) => group.label)).toEqual(['EUR', 'USD', 'Assets'])
    expect(groups[0].accounts.map((point) => point.id)).toEqual(['cash'])
    expect(groups[1].accounts.map((point) => point.id)).toEqual(['bank'])
    const assets = groups[2]
    expect(assets.currency).toBe('EUR')
    expect(assets.accounts.map((point) => point.id)).toEqual(['laptop', 'camera'])
    expect(assets.total).toBeCloseTo(1200 * 0.9 ** 4, 6)
    expect(assets.point.value).toBeCloseTo(1200 * 0.9 ** 4, 6)
  })

  it('keeps assets with missing rates visible without reporting a partial total', () => {
    const groups = buildBoxCharts(state([
      box('laptop', 'EUR', 1000, { kind: 'asset' }),
      box('custom-asset', 'TOKEN', 5, { kind: 'asset' }),
    ]), '2026-01-01')
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Assets')
    expect(groups[0].accounts.map((point) => point.value)).toEqual([1000, null])
    expect(groups[0].total).toBeNull()
    expect(groups[0].point.value).toBeNull()
  })
})
