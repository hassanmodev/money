/**
 * Time & Projects — the pure engine. Fully independent of the money domain:
 * projects, budgets, qualities, the simulation, the scorer, blocks, actuals,
 * and overlap rules, unit-tested in isolation.
 *
 * `computeWeek` is the single façade the UI reads: one call per viewed week
 * returns everything the tab renders — blocks, curves, progress, proposals,
 * and signals.
 */
import { addDays, format, parseISO } from 'date-fns'
import { budgetProgress, type BudgetProgress } from './budgets'
import { expandRules } from './rules'
import { buildScoreContext, type ScoreContext } from './scorer'
import { allSignals, type Signal } from './signals'
import { simulate, type SimResult } from './simulation'
import { suggestWeek, type SuggestResult, type Suggestion, type UnfitReport } from './suggest'
import type { Block, Fragment, ISODate, ProjectId, TimeState } from './types'

export * from './types'
export * from './codes'
export * from './bulk'
export * from './colors'
export * from './qualities'
export * from './simulation'
export * from './budgets'
export * from './rules'
export * from './scorer'
export * from './suggest'
export * from './signals'

export interface WeekData {
  weekStart: ISODate
  days: ISODate[]
  /** plan layer: manual blocks + rule expansions */
  planBlocks: Block[]
  actualBlocks: Block[]
  fragments: Fragment[]
  /** projected quality timeline from the plan layer */
  simPlan: SimResult
  /** derived-actual timeline, replayed over actual blocks + fragments */
  simActual: SimResult
  /** budget progress per project (only projects with a budget) */
  progress: Map<ProjectId, BudgetProgress>
  suggestions: Suggestion[]
  unfit: UnfitReport[]
  /** resolved free-pool minutes per `fr` project this week */
  frAllocs: Map<ProjectId, number>
  signals: Signal[]
  /** scorer context for the viewed week — options lists, slot-fit glows, drag whispers */
  scoreCtx: ScoreContext
}

const inWeek = (weekStart: ISODate, date: ISODate): boolean => {
  const ws = parseISO(weekStart)
  const d = parseISO(date)
  return d >= ws && d <= addDays(ws, 6)
}

/** Everything the time tab needs for one viewed week. */
export function computeWeek(
  state: TimeState,
  weekStart: ISODate,
  now: { date: ISODate; minute: number },
): WeekData {
  const weekEnd = format(addDays(parseISO(weekStart), 6), 'yyyy-MM-dd')
  const byId = new Map(state.projects.map((p) => [p.id, p]))

  const planBlocks = [
    ...state.blocks.filter(
      (b) => b.layer === 'plan' && inWeek(weekStart, b.date) && byId.has(b.projectId),
    ),
    ...expandRules(state.rules, state.projects, weekStart, weekEnd),
  ]
  const actualBlocks = state.blocks.filter(
    (b) => b.layer === 'actual' && inWeek(weekStart, b.date) && byId.has(b.projectId),
  )
  const fragments = state.fragments.filter(
    (f) => byId.has(f.projectId) && inWeek(weekStart, format(parseISO(f.at), 'yyyy-MM-dd')),
  )

  const scoreCtx = buildScoreContext(state, weekStart, now)
  const simPlan = scoreCtx.sim
  const simActual = simulate({
    qualities: state.qualities,
    weekStart,
    blocks: actualBlocks
      .map((b) => {
        const p = byId.get(b.projectId)
        return p && p.effects.length
          ? { date: b.date, startMin: b.startMin, durationMin: b.durationMin, effects: p.effects }
          : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    fragments: fragments
      .map((f) => {
        const p = byId.get(f.projectId)
        return p && p.effects.length ? { at: f.at, minutes: f.minutes, effects: p.effects } : null
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  })

  const progress = new Map<ProjectId, BudgetProgress>()
  for (const p of state.projects) {
    const bp = budgetProgress(state, p, now.date)
    if (bp) progress.set(p.id, bp)
  }

  const { suggestions, unfit, frAllocs }: SuggestResult = suggestWeek(state, weekStart, now)

  return {
    weekStart,
    days: Array.from({ length: 7 }, (_, i) => format(addDays(parseISO(weekStart), i), 'yyyy-MM-dd')),
    planBlocks,
    actualBlocks,
    fragments,
    simPlan,
    simActual,
    progress,
    suggestions,
    unfit,
    frAllocs,
    signals: allSignals(state, weekStart, simPlan, now.date),
    scoreCtx,
  }
}
