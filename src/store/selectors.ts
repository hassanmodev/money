import { useMemo } from 'react'
import {
  boxValueAt,
  mergeCurrencies,
  netWorthAt,
  planGoals,
  project,
  type CurrencyMeta,
  type FinanceState,
  type GoalPlan,
  type ProjectionOptions,
  type ProjectionResult,
} from '@/domain'
import { todayISO } from '@/lib/date'
import { useStore } from './store'

/** The four data slices bundled into a memoized FinanceState. */
export function useFinanceState(): FinanceState {
  const boxes = useStore((s) => s.boxes)
  const transactions = useStore((s) => s.transactions)
  const goals = useStore((s) => s.goals)
  const settings = useStore((s) => s.settings)
  return useMemo(
    () => ({ boxes, transactions, goals, settings }),
    [boxes, transactions, goals, settings],
  )
}

export function useActiveBoxes() {
  const boxes = useStore((s) => s.boxes)
  return useMemo(() => boxes.filter((b) => !b.archived), [boxes])
}

/** The live currency catalogue (defaults + the user's edits), in display order. */
export function useCurrencies(): CurrencyMeta[] {
  const custom = useStore((s) => s.settings.customCurrencies)
  return useMemo(() => mergeCurrencies(custom), [custom])
}

export function useBox(id: string | undefined) {
  return useStore((s) => s.boxes.find((b) => b.id === id))
}

/** Total net worth (base currency) on a date, defaulting to today. */
export function useNetWorth(dateISO?: string): number {
  const state = useFinanceState()
  const date = dateISO ?? todayISO()
  return useMemo(() => netWorthAt(state, date), [state, date])
}

/** A single box's value in its own currency on a date (default today). */
export function useBoxValue(boxId: string, dateISO?: string): number {
  const state = useFinanceState()
  const date = dateISO ?? todayISO()
  return useMemo(() => boxValueAt(state, boxId, date), [state, boxId, date])
}

/** The full forward projection over a horizon, recomputed when inputs change. */
export function useProjection(opts: ProjectionOptions): ProjectionResult {
  const state = useFinanceState()
  return useMemo(
    () => project(state, opts),
    [state, opts.from, opts.to, opts.steps],
  )
}

/** The greedy goal plan over a horizon (months), recomputed when inputs change. */
export function useGoalPlan(horizonMonths: number, discount?: number): GoalPlan {
  const state = useFinanceState()
  const from = todayISO()
  return useMemo(
    () => planGoals(state, { from, horizonMonths, discount }),
    [state, from, horizonMonths, discount],
  )
}
