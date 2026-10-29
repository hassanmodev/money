import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { ActivityLedger } from '@/domain'
import { useStore } from '../store'

vi.hoisted(() => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  }
  vi.stubGlobal('window', { localStorage: storage })
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-02-01T12:00:00'))
  useStore.getState().clearAll()
})
afterEach(() => vi.useRealTimers())

const create = () => useStore.getState().addTransaction({
  kind: 'expense', boxId: 'cash', currency: 'EUR', amount: 100, date: '2026-01-01',
  recurrence: { every: 1, unit: 'month', anchor: '2026-01-01', end: { type: 'never' } },
})

describe('blueprint store actions', () => {
  it('migrates saved recurring transactions and persists their blueprints', async () => {
    const id = create()
    const current = useStore.getState()
    const legacy = { ...current, activityBlueprints: undefined, transactions: new ActivityLedger(current).current().map((tx) => ({ ...tx, blueprintId: undefined })) }
    const options = useStore.persist.getOptions()
    const migrated = await options.migrate!(legacy, 5)
    expect(migrated.activityBlueprints?.[0].id).toBe(id)
    expect(migrated.transactions).toEqual([])
    expect(options.partialize!(current).activityBlueprints).toEqual(current.activityBlueprints)
  })
  it('creates a blueprint and applies edits from today', () => {
    const id = create()
    expect(useStore.getState().transactions).toHaveLength(0)
    useStore.getState().updateTransaction(id, { amount: 250 })
    expect(new ActivityLedger(useStore.getState()).between('2026-01-01', '2026-03-01').map((tx) => tx.amount)).toEqual([100, 250, 250])
  })

  it('updates and deletes individual activities without duplicating them', () => {
    create()
    const [tx] = new ActivityLedger(useStore.getState()).between('2026-01-01', '2026-01-01')
    useStore.getState().updateTransaction(tx.id, { amount: 75, date: '2026-01-10' })
    expect(new ActivityLedger(useStore.getState()).between('2026-01-01', '2026-01-31')).toEqual([expect.objectContaining({ amount: 75, date: '2026-01-10' })])
    useStore.getState().removeTransaction(tx.id)
    expect(new ActivityLedger(useStore.getState()).between('2026-01-01', '2026-01-31')).toEqual([])
    expect(new ActivityLedger(useStore.getState()).between('2026-02-01', '2026-02-28')).toHaveLength(1)
  })

  it('stops the blueprint without erasing history and clears it on reset', () => {
    const id = create()
    useStore.getState().stopBlueprint(id)
    expect(new ActivityLedger(useStore.getState()).between('2026-01-01', '2026-12-31')).toHaveLength(1)
    useStore.getState().clearAll()
    expect(useStore.getState().activityBlueprints).toEqual([])
  })
})
