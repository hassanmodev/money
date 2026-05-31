import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Box, Effect, FinanceState, Goal, Settings, Transaction } from '@/domain'
import { newId } from '@/lib/id'
import { todayISO } from '@/lib/date'
import { createSeed } from './seed'

type NewBox = Omit<Box, 'id' | 'createdAt'>
type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>

interface Actions {
  addBox: (box: NewBox) => string
  updateBox: (id: string, patch: Partial<Box>) => void
  removeBox: (id: string) => void

  upsertEffect: (boxId: string, effect: Effect) => void
  removeEffect: (boxId: string, effectId: string) => void

  addTransaction: (tx: NewTransaction) => string
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  removeTransaction: (id: string) => void

  addGoal: (goal: Omit<Goal, 'id'>) => void
  removeGoal: (id: string) => void

  updateSettings: (patch: Partial<Settings>) => void
  setRate: (code: string, rate: number) => void

  resetAll: () => void
}

export type Store = FinanceState & Actions

const now = () => new Date().toISOString()

export const useStore = create<Store>()(
  persist(
    (set) => ({
      ...createSeed(),

      addBox: (box) => {
        const id = newId('box')
        set((s) => ({ boxes: [...s.boxes, { ...box, id, createdAt: now() }] }))
        return id
      },
      updateBox: (id, patch) =>
        set((s) => ({
          boxes: s.boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),
      removeBox: (id) =>
        set((s) => ({
          boxes: s.boxes.filter((b) => b.id !== id),
          // drop any transactions that referenced the box
          transactions: s.transactions.filter(
            (t) => t.boxId !== id && t.toBoxId !== id,
          ),
        })),

      upsertEffect: (boxId, effect) =>
        set((s) => ({
          boxes: s.boxes.map((b) =>
            b.id !== boxId
              ? b
              : {
                  ...b,
                  effects: b.effects.some((e) => e.id === effect.id)
                    ? b.effects.map((e) => (e.id === effect.id ? effect : e))
                    : [...b.effects, effect],
                },
          ),
        })),
      removeEffect: (boxId, effectId) =>
        set((s) => ({
          boxes: s.boxes.map((b) =>
            b.id === boxId
              ? { ...b, effects: b.effects.filter((e) => e.id !== effectId) }
              : b,
          ),
        })),

      addTransaction: (tx) => {
        const id = newId('tx')
        set((s) => ({ transactions: [...s.transactions, { ...tx, id, createdAt: now() }] }))
        return id
      },
      updateTransaction: (id, patch) =>
        set((s) => ({
          transactions: s.transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      removeTransaction: (id) =>
        set((s) => ({ transactions: s.transactions.filter((t) => t.id !== id) })),

      addGoal: (goal) =>
        set((s) => ({ goals: [...s.goals, { ...goal, id: newId('goal') }] })),
      removeGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      setRate: (code, rate) =>
        set((s) => ({ settings: { ...s.settings, rates: { ...s.settings.rates, [code]: rate } } })),

      resetAll: () => set({ ...createSeed() }),
    }),
    {
      name: 'cozy-money/v1',
      version: 1,
      // persist only the data, never the action functions
      partialize: (s): FinanceState => ({
        boxes: s.boxes,
        transactions: s.transactions,
        goals: s.goals,
        settings: s.settings,
      }),
    },
  ),
)

/** Read the live state outside React (e.g. for one-off calculations). */
export const financeState = (): FinanceState => {
  const s = useStore.getState()
  return { boxes: s.boxes, transactions: s.transactions, goals: s.goals, settings: s.settings }
}

export { todayISO }
