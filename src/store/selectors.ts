import { useMemo } from 'react'
import {
  bankedHappiness,
  boxValueAt,
  goalFundingBoxes,
  goalFundingBudget,
  mergeCurrencies,
  netWorthAt,
  planGoals,
  project,
  type CurrencyMeta,
  type FinanceState,
  type Goal,
  type GoalFundingBox,
  type GoalPlan,
  type HappinessOptions,
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

export function useGoals(): Goal[] {
  return useStore((s) => s.goals)
}

/** The greedy plan over the open goals for a given budget + weighting. */
export function useGoalPlan(budget: number, opts: HappinessOptions): GoalPlan {
  const goals = useGoals()
  return useMemo(
    () => planGoals(goals, budget, opts),
    [goals, budget, opts.now, opts.horizon, opts.halfLifeMonths],
  )
}

/** The planner's budget: live base value of the boxes funding open goals. */
export function useGoalBudget(dateISO?: string): number {
  const state = useFinanceState()
  const date = dateISO ?? todayISO()
  return useMemo(() => goalFundingBudget(state, date), [state, date])
}

/** The boxes backing open goals, each valued today in the base currency. */
export function useGoalFundingBoxes(dateISO?: string): GoalFundingBox[] {
  const state = useFinanceState()
  const date = dateISO ?? todayISO()
  return useMemo(() => goalFundingBoxes(state, date), [state, date])
}

/** Happiness already banked from achieved goals. */
export function useBankedHappiness(opts: HappinessOptions): number {
  const goals = useGoals()
  return useMemo(
    () => bankedHappiness(goals, opts),
    [goals, opts.now, opts.horizon, opts.halfLifeMonths],
  )
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
