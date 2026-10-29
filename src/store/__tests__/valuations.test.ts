import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boxPerformanceAt, type Valuation } from '@/domain'
import { useStore } from '../store'

const initialState = useStore.getState()
vi.hoisted(() => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage })
})
const valuation: Valuation = { id: 'v1', date: '2026-02-01', value: 1200, createdAt: '2026-02-01T00:00:00Z' }

beforeEach(() => {
  useStore.setState({ boxes: [{
    id: 'investment', name: 'Fund', kind: 'investment', currency: 'EUR', openingBalance: 1000,
    openingDate: '2026-01-01', color: '#abcdef', effects: [], createdAt: valuation.createdAt,
  }], transactions: [], goals: [], goalGroups: [], settings: { baseCurrency: 'EUR', rates: {} } })
})

afterEach(() => {
  useStore.setState(initialState, true)
})

describe('value update storage', () => {
  it('replaces the same date and supports moving, correcting, and removing an observation', () => {
    const store = useStore.getState()
    store.upsertValuation('investment', valuation)
    store.upsertValuation('investment', { ...valuation, id: 'replacement', value: 1300 })
    expect(useStore.getState().boxes[0].valuations).toHaveLength(1)
    expect(boxPerformanceAt(useStore.getState(), 'investment', valuation.date).gain).toBe(300)
    store.upsertValuation('investment', { ...valuation, id: 'replacement', date: '2026-03-01', value: 900 })
    expect(boxPerformanceAt(useStore.getState(), 'investment', valuation.date).gain).toBe(0)
    expect(boxPerformanceAt(useStore.getState(), 'investment', '2026-03-01').gain).toBe(-100)
    store.removeValuation('investment', 'replacement')
    expect(boxPerformanceAt(useStore.getState(), 'investment', '2026-03-01').gain).toBe(0)
    expect(useStore.getState().transactions).toEqual([])
  })

  it('rehydrates observations without introducing transactions', async () => {
    useStore.getState().upsertValuation('investment', valuation)
    const saved = JSON.parse(localStorage.getItem('cozy-money/v1')!)
    expect(saved.state.boxes[0].valuations).toEqual([valuation])
    await useStore.persist.rehydrate()
    expect(useStore.getState().boxes[0].valuations).toEqual([valuation])
    expect(useStore.getState().transactions).toEqual([])
    expect(boxPerformanceAt(useStore.getState(), 'investment', valuation.date).gain).toBe(200)
  })
})
