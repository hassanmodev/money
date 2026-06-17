/**
 * Goals — happiness over time, and the greedy plan that captures the most of it
 * with limited money. Pure and framework-free, like the rest of `src/domain`.
 *
 * A goal is worth a `value` (a happiness rating) and costs `cost` (money). Its
 * value can be flat or a curve that shifts over the years. Achieving it *sooner*
 * is worth more: future happiness is discounted, so the prize is the **area
 * under the rating curve** from the day you get it to the horizon. The planner
 * ranks goals by happiness-per-money and buys them in that order as wealth
 * accrues — the classic greedy answer to "most joy on a budget".
 */
import { addMonths, format, parseISO } from 'date-fns'
import { project } from './projection'
import type { FinanceState, Goal, GoalValue, ISODate } from './types'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000
/** Future happiness fades this much per year unless settings say otherwise. */
export const DEFAULT_HAPPINESS_DISCOUNT = 0.15

const iso = (d: Date): ISODate => format(d, 'yyyy-MM-dd')
const yearsBetween = (from: ISODate, to: ISODate): number =>
  (parseISO(to).getTime() - parseISO(from).getTime()) / MS_PER_YEAR

// ── the rating curve ────────────────────────────────────────────────────────

interface Breakpoint {
  year: number // offset from "today"
  value: number
}

/** Normalize a goal's value into ascending (year-offset, rating) breakpoints. */
function breakpoints(value: GoalValue, today: ISODate): Breakpoint[] {
  if (typeof value === 'number') return [{ year: 0, value }]
  const pts = value
    .filter((p) => Number.isFinite(p.value))
    .map((p) => ({ year: yearsBetween(today, p.date), value: p.value }))
    .sort((a, b) => a.year - b.year)
  return pts.length ? pts : [{ year: 0, value: 0 }]
}

/** Rating at year-offset τ — each breakpoint holds until the next (a step curve). */
function ratingAt(bps: Breakpoint[], year: number): number {
  let v = bps[0].value // flat before the first point
  for (const p of bps) {
    if (year >= p.year) v = p.value
    else break
  }
  return v
}

/** The time weight: 1 at "now", decaying so nearer years count for more. */
export const weightAt = (year: number, discount: number): number =>
  Math.exp(-discount * year)

/**
 * Happiness from holding a goal from year `from` to the horizon `H`: the area
 * under rating × weight. Midpoint-sampled monthly — robust for any curve.
 */
function area(bps: Breakpoint[], from: number, H: number, discount: number): number {
  if (from >= H) return 0
  const dt = 1 / 12
  let sum = 0
  for (let t = Math.max(0, from); t < H; t += dt) {
    const span = Math.min(dt, H - t)
    const mid = t + span / 2
    sum += ratingAt(bps, mid) * weightAt(mid, discount) * span
  }
  return sum
}

/** Sample a goal's raw rating across the horizon — for editor/preview sparklines. */
export function sampleRating(
  value: GoalValue,
  today: ISODate,
  horizonMonths: number,
  n = 48,
): number[] {
  const bps = breakpoints(value, today)
  const H = horizonMonths / 12
  return Array.from({ length: n }, (_, i) => ratingAt(bps, (H * i) / (n - 1)))
}

// ── the greedy plan ─────────────────────────────────────────────────────────

export interface PlanOptions {
  from: ISODate // "today"
  horizonMonths: number
  discount?: number
  steps?: number
}

export interface GoalPlanItem {
  goal: Goal
  cost: number
  potential: number // happiness if achieved today (the most it can give)
  captured: number // happiness actually captured (achieved at reachYear)
  density: number // potential ÷ cost — the greedy priority
  reachYear: number | null // when the plan funds it (years from now); null = out of reach
  reachDate: ISODate | null
  fundingNow: number // base currency its funders hold today
  fundingRatio: number // fundingNow ÷ cost, clamped 0..1
}

export interface GoalPlanPoint {
  t: number
  date: ISODate
  cumulative: number // captured happiness unlocked by this date — the rising area
}

export interface GoalPlan {
  items: GoalPlanItem[] // every open goal, in priority (density) order
  totalCaptured: number
  totalPotential: number
  reachedCount: number
  horizonYears: number
  discount: number
  curve: GoalPlanPoint[]
}

/** Base-currency total a goal's funders hold at one projection point (net worth if none). */
function fundingAt(goal: Goal, perBox: Record<string, number>, nominal: number): number {
  if (!goal.boxIds.length) return nominal
  return goal.boxIds.reduce((s, id) => s + (perBox[id] ?? 0), 0)
}

/**
 * The plan. Rank open goals by happiness-per-money, then walk projected wealth
 * forward and fund them in that order — each goal waits until net worth covers
 * the running total of every goal at least as worthy, *and* its own funders
 * cover its cost. Reaching a goal sooner banks more of its discounted area.
 */
export function planGoals(state: FinanceState, opts: PlanOptions): GoalPlan {
  const { from, horizonMonths } = opts
  const discount = opts.discount ?? state.settings.happinessDiscount ?? DEFAULT_HAPPINESS_DISCOUNT
  const horizonYears = horizonMonths / 12
  const to = iso(addMonths(parseISO(from), horizonMonths))
  const steps = opts.steps ?? Math.min(240, Math.max(24, horizonMonths))
  const result = project(state, { from, to, steps })
  const points = result.points
  const p0 = points[0]?.perBox ?? {}
  const nominal0 = points[0]?.nominal ?? 0

  const open = state.goals.filter((g) => g.status === 'open')
  const ranked = open
    .map((goal) => {
      const bps = breakpoints(goal.value, from)
      const potential = area(bps, 0, horizonYears, discount)
      const fundingNow = fundingAt(goal, p0, nominal0)
      return {
        goal,
        bps,
        cost: goal.cost,
        potential,
        density: potential / Math.max(goal.cost, 1e-9),
        fundingNow,
        fundingRatio: goal.cost > 0 ? Math.min(1, fundingNow / goal.cost) : 1,
      }
    })
    .sort((a, b) => b.density - a.density || b.potential - a.potential || a.cost - b.cost)

  let reserved = 0
  const items: GoalPlanItem[] = ranked.map((r) => {
    reserved += Math.max(0, r.cost)
    // earliest moment net worth covers everything reserved so far AND this
    // goal's own funders cover its cost.
    const hit = points.find(
      (pt) => pt.nominal + 1e-6 >= reserved && fundingAt(r.goal, pt.perBox, pt.nominal) + 1e-6 >= r.cost,
    )
    const reachYear = hit ? yearsBetween(from, hit.date) : null
    const captured = reachYear !== null ? area(r.bps, reachYear, horizonYears, discount) : 0
    return {
      goal: r.goal,
      cost: r.cost,
      potential: r.potential,
      captured,
      density: r.density,
      reachYear,
      reachDate: hit?.date ?? null,
      fundingNow: r.fundingNow,
      fundingRatio: r.fundingRatio,
    }
  })

  const curve: GoalPlanPoint[] = points.map((pt) => {
    const yr = yearsBetween(from, pt.date)
    const cumulative = items.reduce(
      (s, it) => s + (it.reachYear !== null && it.reachYear <= yr + 1e-9 ? it.captured : 0),
      0,
    )
    return { t: pt.t, date: pt.date, cumulative }
  })

  return {
    items,
    totalCaptured: items.reduce((s, it) => s + it.captured, 0),
    totalPotential: items.reduce((s, it) => s + it.potential, 0),
    reachedCount: items.filter((it) => it.reachYear !== null).length,
    horizonYears,
    discount,
    curve,
  }
}
