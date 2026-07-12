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
  type GoalGroup,
  type HappinessOptions,
  type PlannedBuy,
  type ProjectionOptions,
  type ProjectionResult,
  type ScheduledPlan,
} from '@/domain'
import { addMonthsISO, yearsBetween } from '@/lib/date'
import { useStore } from './store'
import { useToday, useViewDate } from './time'

/** The app's notion of "now" — the time-travel cursor (defaults to today). */
const useNow = useViewDate

/** How far ahead the committed plan looks when forecasting planned buys. */
const PLAN_HORIZON_MONTHS = 48

/** The four data slices bundled into a memoized FinanceState. */
export function useFinanceState(): FinanceState {
  const boxes = useStore((s) => s.boxes)
  const transactions = useStore((s) => s.transactions)
  const goals = useStore((s) => s.goals)
  const goalGroups = useStore((s) => s.goalGroups)
  const settings = useStore((s) => s.settings)
  return useMemo(
    () => ({ boxes, transactions, goals, goalGroups, settings }),
    [boxes, transactions, goals, goalGroups, settings],
  )
}

export function useActiveBoxes() {
  const boxes = useStore((s) => s.boxes)
  return useMemo(() => boxes.filter((b) => !b.archived), [boxes])
}

export function useGoals(): Goal[] {
  return useStore((s) => s.goals)
}

export function useGoalGroups(): GoalGroup[] {
  return useStore((s) => s.goalGroups)
}

/**
 * The time-aware plan: each open goal gets an achieve-date along the funding
 * pot's projected cash-flow curve, deferring purchases when spending now would
 * block a better goal later.
 * The grid is monthly from `now` out to the horizon.
 */
export function useScheduledPlan(opts: HappinessOptions): ScheduledPlan {
  const state = useFinanceState()
  return useMemo(() => {
    const months = Math.max(1, Math.round(yearsBetween(opts.now, opts.horizon) * 12))
    const grid = Array.from({ length: months + 1 }, (_, i) => addMonthsISO(opts.now, i))
    const budgetCurve = goalBudgetCurve(state, grid)
    return planGoalsScheduled(state.goals, { ...opts, grid, budgetCurve, groups: state.goalGroups })
  }, [state, opts.now, opts.horizon, opts.halfLifeMonths])
}

/**
 * The one committed plan the whole app shares, anchored at the REAL today (not
 * the time-travel cursor) so every buy keeps a fixed date as you scrub time.
 *
 * This is the single source the goals page, the projection, net worth, and the
 * activity feed all derive from — so "what the plan does" is coherent everywhere
 * rather than re-planned per view. Travelling forward then back recomputes from
 * this one snapshot, never mutating, so there's no drift and no second version.
 */
export function useCommittedPlan(): ScheduledPlan {
  const halfLifeMonths = useStore((s) => s.settings.happinessHalfLifeMonths ?? 24)
  const now = useToday()
  const opts = useMemo<HappinessOptions>(
    () => ({ now, horizon: addMonthsISO(now, PLAN_HORIZON_MONTHS), halfLifeMonths }),
    [now, halfLifeMonths],
  )
  return useScheduledPlan(opts)
}

export function useGoalAutoApply(): boolean {
  return useStore((s) => s.settings.goalAutoApply ?? true)
}

/** Convert the committed schedule into the synthetic buys shared by the app. */
export function plannedBuysFromPlan(plan: ScheduledPlan, today: string): PlannedBuy[] {
  return plan.scheduled
    .filter((s) => s.achieveDate >= today)
    .map((s) => ({
      id: s.goal.id,
      label: s.goal.name,
      date: s.achieveDate,
      cost: s.cost,
      color: s.goal.color,
      createdAt: s.goal.createdAt,
    }))
}

/** The committed plan's buys from today onward, before the auto-apply setting. */
export function useCommittedPlannedBuys(): PlannedBuy[] {
  const plan = useCommittedPlan()
  const today = useToday()
  return useMemo(() => plannedBuysFromPlan(plan, today), [plan, today])
}

/**
 * The committed plan buys currently applied to balances. With auto-apply off,
 * scheduled goals remain advisory and do not become synthetic expenses.
 */
export function usePlannedBuys(): PlannedBuy[] {
  const autoApply = useGoalAutoApply()
  const buys = useCommittedPlannedBuys()
  return useMemo(() => (autoApply ? buys : []), [autoApply, buys])
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

/**
 * Total net worth (base currency) on a date, defaulting to today. Future planned
 * buys deduct once their date is reached: today this is your actual money, and
 * as you time-travel forward each buy the plan has passed has left.
 */
export function useNetWorth(dateISO?: string): number {
  const state = useFinanceState()
  const view = useNow()
  const date = dateISO ?? view
  const planned = usePlannedBuys()
  return useMemo(() => netWorthAt(state, date, planned), [state, date, planned])
}

/** Net worth without scheduled goal auto-buys, while still counting manual achieved goals. */
export function useNetWorthWithoutPlannedGoals(dateISO?: string): number {
  const state = useFinanceState()
  const view = useNow()
  const date = dateISO ?? view
  return useMemo(() => netWorthAt(state, date), [state, date])
}

/** Net worth with the committed scheduled goal buys, regardless of the auto-apply toggle. */
export function useNetWorthWithPlannedGoals(dateISO?: string): number {
  const state = useFinanceState()
  const view = useNow()
  const date = dateISO ?? view
  const planned = useCommittedPlannedBuys()
  return useMemo(() => netWorthAt(state, date, planned), [state, date, planned])
}

/** A single box's value in its own currency on a date (default today). */
export function useBoxValue(boxId: string, dateISO?: string): number {
  const state = useFinanceState()
  const view = useNow()
  const date = dateISO ?? view
  const planned = usePlannedBuys()
  return useMemo(() => boxValueAt(state, boxId, date, planned), [state, boxId, date, planned])
}

/**
 * The full forward projection over a horizon, recomputed when inputs change. The
 * committed plan's future buys ride through as outflows, so the curve dips on
 * each buy's date — the planning view sees exactly what the goal plan will spend.
 */
export function useProjection(opts: ProjectionOptions): ProjectionResult {
  const state = useFinanceState()
  const planned = usePlannedBuys()
  return useMemo(
    () => project(state, opts, planned),
    [state, planned, opts.from, opts.to, opts.steps],
  )
}
