/**
 * Goals & happiness — the planner's brain.
 *
 * A goal costs money and pays happiness *over time*. You rate it (flat, or a
 * step curve that rises and falls across seasons of life); the engine overlays
 * a **distance discount** so sooner-and-nearer happiness outweighs distant
 * happiness — planning too far ahead is worth less. Total happiness is the area
 * under `rating × discount`, from the day you achieve the goal to the horizon.
 *
 * With a limited budget you can't have everything, so {@link planGoals} picks
 * greedily by happiness-per-cost — the classic knapsack heuristic — until the
 * money runs out.
 *
 * Plain data in, plain numbers out. Pure and framework-free, like the rest of
 * `src/domain`; the behavioural classes hydrate from records and are discarded.
 */
import { parseISO } from 'date-fns'
import type { Goal, GoalValue, ISODate } from './types'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000
const LN2 = Math.LN2
/** Below this λ the discount is effectively flat — integrate linearly instead. */
const FLAT = 1e-9

/** How the goal planner reads "now", "how far to look", and "how steep". */
export interface HappinessOptions {
  /** the planning anchor — distance is measured from here */
  now: ISODate
  /** how far ahead happiness is counted */
  horizon: ISODate
  /** worth halves every this-many months of distance (default 24; 0 = no decay) */
  halfLifeMonths?: number
}

/** Convert a half-life in months into a decay rate λ (per year). 0 ⇒ no decay. */
function lambdaOf(halfLifeMonths = 24): number {
  if (!halfLifeMonths || halfLifeMonths <= 0) return 0
  return LN2 / (halfLifeMonths / 12)
}

/** Weight of happiness `years` into the future — 1 now, fading with distance. */
export function distanceWeight(years: number, halfLifeMonths = 24): number {
  const lambda = lambdaOf(halfLifeMonths)
  return lambda < FLAT ? 1 : Math.exp(-lambda * Math.max(0, years))
}

interface Segment {
  /** years-from-now where this rating begins (first is −∞, clamped to start) */
  from: number
  rating: number
}

/**
 * A goal's worth as a function of time, in years-from-now.
 *
 * Built from the raw `GoalValue`, it reads the rating at any moment and — the
 * useful bit — integrates `rating × discount` across a span, which is the
 * happiness the goal banks while you hold it.
 */
export class RatingCurve {
  private readonly segments: Segment[]

  constructor(value: GoalValue, now: ISODate) {
    const t0 = parseISO(now).getTime()
    const toYears = (iso: ISODate) => (parseISO(iso).getTime() - t0) / MS_PER_YEAR

    if (value.type === 'flat') {
      this.segments = [{ from: -Infinity, rating: value.rating }]
      return
    }
    const points = value.points
      .filter((p) => Number.isFinite(p.rating))
      .map((p) => ({ from: toYears(p.from), rating: p.rating }))
      .sort((a, b) => a.from - b.from)

    if (points.length === 0) {
      this.segments = [{ from: -Infinity, rating: 0 }]
      return
    }
    // The first rating extends backward; each later point starts its own tier.
    this.segments = points.map((p, i) => ({
      from: i === 0 ? -Infinity : p.from,
      rating: p.rating,
    }))
  }

  /** Undiscounted rating at `years` from now (the raw curve the user drew). */
  rateAt(years: number): number {
    let r = this.segments[0].rating
    for (const s of this.segments) {
      if (years >= s.from) r = s.rating
      else break
    }
    return r
  }

  /**
   * Total discounted happiness banked over [`fromY`, `toY`] (years-from-now) —
   * the area under `rating × e^(−λ·year)`. Closed-form per flat segment, so
   * it's exact, not sampled.
   */
  area(fromY: number, toY: number, halfLifeMonths = 24): number {
    if (toY <= fromY) return 0
    const lambda = lambdaOf(halfLifeMonths)
    let total = 0
    for (let i = 0; i < this.segments.length; i++) {
      const segStart = this.segments[i].from
      const segEnd = i + 1 < this.segments.length ? this.segments[i + 1].from : Infinity
      const a = Math.max(fromY, segStart)
      const b = Math.min(toY, segEnd)
      if (b <= a) continue
      const R = this.segments[i].rating
      total += lambda < FLAT ? R * (b - a) : (R * (Math.exp(-lambda * a) - Math.exp(-lambda * b))) / lambda
    }
    return total
  }
}

/** The discounted happiness a goal banks if achieved on `achieveDate`. */
export function goalHappiness(goal: Goal, achieveDate: ISODate, opts: HappinessOptions): number {
  const curve = new RatingCurve(goal.value, opts.now)
  const t0 = parseISO(opts.now).getTime()
  const fromY = (parseISO(achieveDate).getTime() - t0) / MS_PER_YEAR
  const toY = (parseISO(opts.horizon).getTime() - t0) / MS_PER_YEAR
  return curve.area(Math.max(0, fromY), toY, opts.halfLifeMonths)
}

/** Total happiness already banked from achieved (`done`) goals. */
export function bankedHappiness(goals: Goal[], opts: HappinessOptions): number {
  return goals
    .filter((g) => g.status === 'done' && g.doneDate)
    .reduce((sum, g) => sum + goalHappiness(g, g.doneDate!, opts), 0)
}

/** One goal weighed up by the optimizer: its happiness, cost, and bang-for-buck. */
export interface GoalScore {
  goal: Goal
  /** happiness if achieved as soon as possible (today) */
  happiness: number
  cost: number
  /** happiness per unit cost — what the greedy sort ranks on */
  density: number
}

export interface GoalPlan {
  /** goals the budget can afford, in the order they earn their keep */
  chosen: GoalScore[]
  /** wanted but unaffordable within the budget */
  skipped: GoalScore[]
  budget: number
  /** money the plan commits */
  spend: number
  /** happiness the plan unlocks (on top of whatever's already banked) */
  happiness: number
}

/**
 * The optimal greedy plan: among the open goals, take the best happiness-per-
 * cost first and keep going while the budget lasts. Free goals (cost ≤ 0) lead;
 * anything pricier than the whole budget can never be chosen.
 */
export function planGoals(goals: Goal[], budget: number, opts: HappinessOptions): GoalPlan {
  const scores: GoalScore[] = goals
    .filter((g) => g.status === 'open')
    .map((goal) => {
      const happiness = goalHappiness(goal, opts.now, opts)
      const cost = Math.max(0, goal.cost)
      const density = cost <= 0 ? Infinity : happiness / cost
      return { goal, happiness, cost, density }
    })
    // best bang-for-buck first; ties broken by raw happiness
    .sort((a, b) => b.density - a.density || b.happiness - a.happiness)

  const chosen: GoalScore[] = []
  const skipped: GoalScore[] = []
  let spend = 0
  let happiness = 0
  for (const s of scores) {
    if (spend + s.cost <= budget && s.happiness > 0) {
      chosen.push(s)
      spend += s.cost
      happiness += s.happiness
    } else {
      skipped.push(s)
    }
  }
  return { chosen, skipped, budget, spend, happiness }
}

/**
 * A goal's spend, split evenly across the boxes funding it, each leg in that
 * box's own currency-agnostic *base* amount. Used to draw the cost out of the
 * projection on the day a goal is achieved. Goals with no funding box don't
 * touch any balance (they're advisory markers only).
 */
export function goalFundingLegs(goal: Goal, fundingBoxIds: string[]): { boxId: string; baseAmount: number }[] {
  if (fundingBoxIds.length === 0) return []
  const each = goal.cost / fundingBoxIds.length
  return fundingBoxIds.map((boxId) => ({ boxId, baseAmount: each }))
}
