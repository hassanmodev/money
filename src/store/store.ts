import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Box,
  CurrencyMeta,
  Effect,
  FinanceState,
  Goal,
  GoalGroup,
  GoalStatus,
  GoalValue,
  Settings,
  Transaction,
  Valuation,
} from '@/domain'
import { ActivityLedger, setCustomCurrencies } from '@/domain'
import { newId } from '@/lib/id'
import { todayISO } from '@/lib/date'
import { createEmpty, createSeed } from './seed'

type NewBox = Omit<Box, 'id' | 'createdAt'>
type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>
type NewGoal = Omit<Goal, 'id' | 'createdAt'>
type NewGoalGroup = Omit<GoalGroup, 'id' | 'createdAt'>

interface Actions {
  addBox: (box: NewBox) => string
  updateBox: (id: string, patch: Partial<Box>) => void
  removeBox: (id: string) => void
  reorderBoxes: (orderedActiveIds: string[]) => void

  upsertEffect: (boxId: string, effect: Effect) => void
  removeEffect: (boxId: string, effectId: string) => void
  upsertValuation: (boxId: string, valuation: Valuation) => void
  removeValuation: (boxId: string, valuationId: string) => void

  addTransaction: (tx: NewTransaction) => string
  updateTransaction: (id: string, patch: Partial<Transaction>) => void
  removeTransaction: (id: string) => void
  stopBlueprint: (id: string) => void

  addGoal: (goal: NewGoal) => string
  updateGoal: (id: string, patch: Partial<Goal>) => void
  removeGoal: (id: string) => void
  /** Mark a goal achieved / shelved / wanted again, stamping the achieved date. */
  setGoalStatus: (id: string, status: GoalStatus, doneDate?: string) => void

  /** Create an alternative-set; returns its id so a goal can join it. */
  addGoalGroup: (group: NewGoalGroup) => string
  updateGoalGroup: (id: string, patch: Partial<GoalGroup>) => void
  /** Remove a group, clearing its `groupId` off every member (goals are kept). */
  removeGoalGroup: (id: string) => void

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

const legacyRatingToHundred = (rating: number): number =>
  rating >= 0 && rating <= 10 ? rating * 10 : rating

const migrateGoalValueToHundred = (value: GoalValue): GoalValue =>
  value.type === 'flat'
    ? { ...value, rating: legacyRatingToHundred(value.rating) }
    : {
        ...value,
        points: value.points.map((p) => ({ ...p, rating: legacyRatingToHundred(p.rating) })),
      }

export const useStore = create<Store>()(
  persist(
    (set) => ({
      ...createSeed(),
      ...new ActivityLedger(createSeed()).migrate(),

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
          activityBlueprints: (s.activityBlueprints ?? []).filter((blueprint) =>
            !blueprint.versions.some((v) => v.boxId === id || v.toBoxId === id)),
        })),
      reorderBoxes: (orderedActiveIds) =>
        set((s) => {
          const activeOrder = new Map(orderedActiveIds.map((id, i) => [id, i]))
          const active = [...s.boxes]
            .filter((b) => !b.archived && activeOrder.has(b.id))
            .sort((a, b) => activeOrder.get(a.id)! - activeOrder.get(b.id)!)

          let nextActive = 0
          return {
            boxes: s.boxes.map((b) =>
              !b.archived && activeOrder.has(b.id) ? active[nextActive++] : b,
            ),
          }
        }),

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

      upsertValuation: (boxId, valuation) =>
        set((s) => ({
          boxes: s.boxes.map((box) => box.id !== boxId ? box : {
            ...box,
            valuations: [...(box.valuations ?? []).filter((v) => v.id !== valuation.id && v.date !== valuation.date), valuation],
          }),
        })),
      removeValuation: (boxId, valuationId) =>
        set((s) => ({
          boxes: s.boxes.map((box) => box.id !== boxId ? box : {
            ...box, valuations: (box.valuations ?? []).filter((v) => v.id !== valuationId),
          }),
        })),

      addTransaction: (tx) => {
        const id = newId('tx')
        const transaction = { ...tx, id, createdAt: now() }
        set((s) => tx.recurrence
          ? { activityBlueprints: [...(s.activityBlueprints ?? []), ActivityLedger.blueprint(transaction)] }
          : { transactions: [...s.transactions, transaction] })
        return id
      },
      updateTransaction: (id, patch) =>
        set((s) => {
          const blueprint = s.activityBlueprints?.find((b) => b.id === id)
          if (blueprint) return {
            activityBlueprints: s.activityBlueprints!.map((b) => b.id === id
              ? new ActivityLedger(s).revise(b, patch, todayISO()) : b),
          }
          let existing = s.transactions.find((t) => t.id === id)
          if (!existing) {
            const date = id.slice(-10)
            existing = new ActivityLedger(s).between(date, date).find((t) => t.id === id)
          }
          if (!existing) return {}
          const tx = { ...existing, ...patch, id }
          if (tx.recurrence) return {
            transactions: s.transactions.filter((t) => t.id !== id),
            activityBlueprints: [...(s.activityBlueprints ?? []), ActivityLedger.blueprint(tx)],
          }
          return { transactions: [...s.transactions.filter((t) => t.id !== id), tx] }
        }),
      removeTransaction: (id) =>
        set((s) => ({
          transactions: s.transactions.filter((t) => t.id !== id),
          activityBlueprints: (s.activityBlueprints ?? []).map((b) => {
            if (!id.startsWith(`${b.id}:`)) return b
            return { ...b, skippedDates: [...(b.skippedDates ?? []), id.slice(b.id.length + 1)] }
          }),
        })),
      stopBlueprint: (id) => set((s) => ({
        activityBlueprints: (s.activityBlueprints ?? []).map((b) => b.id === id
          ? { ...b, stoppedOn: todayISO() } : b),
      })),

      addGoal: (goal) => {
        const id = newId('goal')
        set((s) => ({ goals: [...s.goals, { ...goal, id, createdAt: now() }] }))
        return id
      },
      updateGoal: (id, patch) =>
        set((s) => ({
          goals: s.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
        })),
      removeGoal: (id) =>
        set((s) => ({ goals: s.goals.filter((g) => g.id !== id) })),
      setGoalStatus: (id, status, doneDate) =>
        set((s) => ({
          goals: s.goals.map((g) =>
            g.id !== id
              ? g
              : {
                  ...g,
                  status,
                  // stamp the achieved date when completing; clear it otherwise
                  doneDate: status === 'done' ? (doneDate ?? g.doneDate ?? todayISO()) : undefined,
                },
          ),
        })),

      addGoalGroup: (group) => {
        const id = newId('grp')
        set((s) => ({ goalGroups: [...s.goalGroups, { ...group, id, createdAt: now() }] }))
        return id
      },
      updateGoalGroup: (id, patch) =>
        set((s) => ({
          goalGroups: s.goalGroups.map((gr) => (gr.id === id ? { ...gr, ...patch } : gr)),
        })),
      removeGoalGroup: (id) =>
        set((s) => ({
          goalGroups: s.goalGroups.filter((gr) => gr.id !== id),
          // free the members; never delete the goals themselves
          goals: s.goals.map((g) => (g.groupId === id ? { ...g, groupId: undefined } : g)),
        })),

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
        return set({ ...seed, ...new ActivityLedger(seed).migrate() })
      },

      clearAll: () => {
        const empty = createEmpty()
        setCustomCurrencies(empty.settings.customCurrencies)
        return set({ ...empty, activityBlueprints: [] })
      },
    }),
    {
      name: 'cozy-money/v1',
      version: 6,
      // Older saves predate goals — fold in an empty list so the engine is safe.
      // v3 moved funding from per-goal `boxIds` onto a box `fundsGoals` flag:
      // any box a goal used to draw from joins the shared pool, and the now-dead
      // `boxIds` field is stripped off each goal.
      // v4 adds alternative-sets — seed an empty `goalGroups` list.
      // v5 promotes goal ratings from a 0-10 scale to a 0-100 scale.
      migrate: (persisted, version) => {
        const s = persisted as Partial<FinanceState>
        if (version < 2 && !s.goals) s.goals = []
        if (version < 3) {
          const legacyGoals = (s.goals ?? []) as Array<Goal & { boxIds?: string[] }>
          const funders = new Set(legacyGoals.flatMap((g) => g.boxIds ?? []))
          s.boxes = (s.boxes ?? []).map((b) =>
            funders.has(b.id) ? { ...b, fundsGoals: true } : b,
          )
          s.goals = legacyGoals.map((g) => {
            const next = { ...g }
            delete next.boxIds
            return next
          })
        }
        if (version < 4 && !s.goalGroups) s.goalGroups = []
        if (version < 5) {
          s.goals = (s.goals ?? []).map((g) => ({
            ...g,
            value: migrateGoalValueToHundred(g.value),
          }))
        }
        if (version < 6) Object.assign(s, new ActivityLedger({ transactions: s.transactions ?? [] }).migrate())
        return s as FinanceState
      },
      // persist only the data, never the action functions
      partialize: (s): FinanceState => ({
        boxes: s.boxes,
        transactions: s.transactions,
        activityBlueprints: s.activityBlueprints,
        goals: s.goals,
        goalGroups: s.goalGroups,
        settings: s.settings,
      }),
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
  return { boxes: s.boxes, transactions: s.transactions, activityBlueprints: s.activityBlueprints, goals: s.goals, goalGroups: s.goalGroups, settings: s.settings }
}

export { todayISO }
