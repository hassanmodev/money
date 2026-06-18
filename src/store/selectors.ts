import { useMemo } from 'react'
import {
  bankedHappiness,
  boxValueAt,
  goalBudgetCurve,
  goalFundingBoxes,
  goalFundingBudget,
  mergeCurrencies,
  netWorthAt,
  planGoalsScheduled,
  project,
  type CurrencyMeta,
  type FinanceState,
  type Goal,
  type GoalFundingBox,
  type HappinessOptions,
  type ProjectionOptions,
  type ProjectionResult,
  type ScheduledPlan,
} from '@/domain'
import { addMonthsISO, yearsBetween } from '@/lib/date'
import { useStore } from './store'
import { useTimeTravel } from './time'

/** The app's notion of "now" — the time-travel cursor (defaults to today). */
const useNow = () => useTimeTravel((s) => s.viewDate)

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

/**
 * The time-aware plan: each open goal gets an achieve-date along the funding
 * pot's growth curve, deferring purchases when waiting unlocks more happiness.
 * The grid is monthly from `now` out to the horizon.
 */
export function useScheduledPlan(opts: HappinessOptions): ScheduledPlan {
  const state = useFinanceState()
  return useMemo(() => {
    const months = Math.max(1, Math.round(yearsBetween(opts.now, opts.horizon) * 12))
    const grid = Array.from({ length: months + 1 }, (_, i) => addMonthsISO(opts.now, i))
    const budgetCurve = goalBudgetCurve(state, grid)
    return planGoalsScheduled(state.goals, { ...opts, grid, budgetCurve })
  }, [state, opts.now, opts.horizon, opts.halfLifeMonths])
}

/** The planner's budget: live base value of the boxes funding open goals. */
export function useGoalBudget(dateISO?: string): number {
  const state = useFinanceState()
  const view = useNow()
  const date = dateISO ?? view
  return useMemo(() => goalFundingBudget(state, date), [state, date])
}

/** The boxes backing open goals, each valued today in the base currency. */
export function useGoalFundingBoxes(dateISO?: string): GoalFundingBox[] {
  const state = useFinanceState()
  const view = useNow()
  const date = dateISO ?? view
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
  const view = useNow()
  const date = dateISO ?? view
  return useMemo(() => netWorthAt(state, date), [state, date])
}

/** A single box's value in its own currency on a date (default today). */
export function useBoxValue(boxId: string, dateISO?: string): number {
  const state = useFinanceState()
  const view = useNow()
  const date = dateISO ?? view
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
