import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Box, CurrencyMeta, Effect, FinanceState, Goal, GoalStatus, Settings, Transaction } from '@/domain'
import { setCustomCurrencies } from '@/domain'
import { newId } from '@/lib/id'
import { todayISO } from '@/lib/date'
import { createEmpty, createSeed } from './seed'

type NewBox = Omit<Box, 'id' | 'createdAt'>
type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>
type NewGoal = Omit<Goal, 'id' | 'createdAt' | 'status'> & { status?: GoalStatus }

interface Actions {
  addBox: (box: NewBox) => string
  updateBox: (id: string, patch: Partial<Box>) => void
  removeBox: (id: string) => void

  upsertEffect: (boxId: string, effect: Effect) => void
  removeEffect: (boxId: string, effectId: string) => void

  addTransaction: (tx: NewTransaction) => string
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  removeTransaction: (id: string) => void

  addGoal: (goal: NewGoal) => string
  updateGoal: (id: string, patch: Partial<Goal>) => void
  removeGoal: (id: string) => void

  updateSettings: (patch: Partial<Settings>) => void
  setRate: (code: string, rate: number) => void

  /** Add a brand-new currency or override a built-in one (matched by code). */
  upsertCurrency: (meta: CurrencyMeta) => void
  /** Remove a custom currency, or revert a built-in override to its default. */
  removeCurrency: (code: string) => void

  resetAll: () => void
  clearAll: () => void
}

export type Store = FinanceState & Actions

const now = () => new Date().toISOString()
const CREATED_FALLBACK = '2025-09-01T10:00:00.000Z'

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
          // and unlink it from any goal it was funding
          goals: s.goals.map((g) =>
            g.boxIds.includes(id) ? { ...g, boxIds: g.boxIds.filter((b) => b !== id) } : g,
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

      addGoal: (goal) => {
        const id = newId('goal')
        set((s) => ({
          goals: [...s.goals, { ...goal, status: goal.status ?? 'open', id, createdAt: now() }],
        }))
        return id
      },
      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      removeGoal: (id) => set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      setRate: (code, rate) =>
        set((s) => ({ settings: { ...s.settings, rates: { ...s.settings.rates, [code]: rate } } })),

      upsertCurrency: (meta) =>
        set((s) => {
          const rest = (s.settings.customCurrencies ?? []).filter((c) => c.code !== meta.code)
          const customCurrencies = [...rest, meta]
          setCustomCurrencies(customCurrencies)
          return { settings: { ...s.settings, customCurrencies } }
        }),
      removeCurrency: (code) =>
        set((s) => {
          const customCurrencies = (s.settings.customCurrencies ?? []).filter((c) => c.code !== code)
          setCustomCurrencies(customCurrencies)
          return { settings: { ...s.settings, customCurrencies } }
        }),

      resetAll: () => {
        const seed = createSeed()
        setCustomCurrencies(seed.settings.customCurrencies)
        return set({ ...seed })
      },

      clearAll: () => {
        const empty = createEmpty()
        setCustomCurrencies(empty.settings.customCurrencies)
        return set({ ...empty })
      },
    }),
    {
      name: 'cozy-money/v1',
      version: 2,
      // persist only the data, never the action functions
      partialize: (s): FinanceState => ({
        boxes: s.boxes,
        transactions: s.transactions,
        goals: s.goals,
        settings: s.settings,
      }),
      // v1 goals were bare net-worth targets; carry them into the richer shape.
      migrate: (persisted, version) => {
        const state = persisted as Partial<FinanceState> | undefined
        if (state?.goals && version < 2) {
          state.goals = state.goals.map((g) => {
            const old = g as { target?: number; cost?: number; value?: Goal['value'] } & Goal
            return {
              id: old.id,
              label: old.label ?? 'Goal',
              cost: old.cost ?? old.target ?? 0,
              value: old.value ?? 5,
              boxIds: old.boxIds ?? [],
              color: old.color,
              note: old.note,
              status: old.status ?? 'open',
              completedDate: old.completedDate,
              createdAt: old.createdAt ?? CREATED_FALLBACK,
            }
          })
        }
        return state as FinanceState
      },
      // Fold the persisted custom currencies back into the live catalogue once
      // storage rehydrates, so lookups/formatting see the user's edits.
      onRehydrateStorage: () => (state) => {
        setCustomCurrencies(state?.settings.customCurrencies)
      },
    },
  ),
)

/** Read the live state outside React (e.g. for one-off calculations). */
export const financeState = (): FinanceState => {
  const s = useStore.getState()
  return { boxes: s.boxes, transactions: s.transactions, goals: s.goals, settings: s.settings }
}

export { todayISO }
