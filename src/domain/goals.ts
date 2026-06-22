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
import type { Goal, GoalGroup, GoalValue, ISODate } from './types'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000
const LN2 = Math.LN2
/** Below this λ the discount is effectively flat — integrate linearly instead. */
const FLAT = 1e-9

/** Fraction of the older item's value forfeited when upgrading, unless a group overrides it. */
export const DEFAULT_UPGRADE_LOSS = 0.15

/**
 * The top of the rating scale — a maxed goal rates this. Used to turn an
 * umbrella's own rating into the fraction of its boost that actually lands.
 * Mirrors the UI's `MAX_RATING`; kept here so the domain stays import-free.
 */
export const RATING_MAX = 10

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

  /** Years-from-now where the rating steps — the finite segment starts. */
  breakpoints(): number[] {
    return this.segments.map((s) => s.from).filter((f) => Number.isFinite(f))
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

/** An achieved umbrella goal, feeding the time-varying happiness multiplier. */
export interface UmbrellaSource {
  /** the umbrella's own rating over time (years-from-now) */
  curve: RatingCurve
  /** the bump at full rating — 0.15 lifts everything by 15% when maxed */
  boost: number
  /** years-from-now the umbrella switches on (≥ 0) */
  fromYear: number
  /** the umbrella goal's id, so a goal is never boosted by itself */
  goalId: string
}

/**
 * The happiness multiplier `years` from now. Every umbrella switched on by then
 * lifts the total by `boost × (rating(years) / RATING_MAX)`, stacking
 * multiplicatively — a zero-rated umbrella contributes ×1, a maxed one ×(1+boost).
 * `exclude` skips a goal so it never amplifies itself.
 */
export function umbrellaMultiplierAt(sources: UmbrellaSource[], years: number, exclude?: string): number {
  let m = 1
  for (const s of sources) {
    if (s.goalId === exclude || years + 1e-9 < s.fromYear) continue
    const frac = Math.max(0, Math.min(1, s.curve.rateAt(years) / RATING_MAX))
    m *= 1 + s.boost * frac
  }
  return m
}

/** Closed-form ∫ e^(−λy) dy over [a,b] — the bare distance discount. */
function discountIntegral(a: number, b: number, lambda: number): number {
  if (b <= a) return 0
  return lambda < FLAT ? b - a : (Math.exp(-lambda * a) - Math.exp(-lambda * b)) / lambda
}

/**
 * Discounted happiness of a rating curve over [`fromY`,`toY`], lifted by the
 * umbrella multiplier. Both the rating and the multiplier are piecewise-constant,
 * so we cut the span at every breakpoint of either and integrate the discount
 * closed-form on each piece — still exact, never sampled.
 */
function multipliedArea(
  curve: RatingCurve,
  fromY: number,
  toY: number,
  halfLifeMonths = 24,
  sources: UmbrellaSource[] = [],
  exclude?: string,
): number {
  if (toY <= fromY) return 0
  const lambda = lambdaOf(halfLifeMonths)
  const cuts = new Set<number>([fromY, toY])
  const add = (x: number) => {
    if (x > fromY && x < toY) cuts.add(x)
  }
  for (const bp of curve.breakpoints()) add(bp)
  for (const s of sources) {
    if (s.goalId === exclude) continue
    add(s.fromYear)
    for (const bp of s.curve.breakpoints()) add(bp)
  }
  const xs = [...cuts].sort((a, b) => a - b)
  let total = 0
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]
    const b = xs[i + 1]
    const mid = (a + b) / 2
    const r = curve.rateAt(mid)
    if (r === 0) continue
    total += r * umbrellaMultiplierAt(sources, mid, exclude) * discountIntegral(a, b, lambda)
  }
  return total
}

/**
 * The discounted happiness a goal banks if achieved on `achieveDate`. Pass the
 * active `umbrellas` to fold in their time-varying lift (a goal never boosts
 * itself); omit them for the bare, unamplified worth.
 */
export function goalHappiness(
  goal: Goal,
  achieveDate: ISODate,
  opts: HappinessOptions,
  umbrellas?: UmbrellaSource[],
): number {
  const curve = new RatingCurve(goal.value, opts.now)
  const t0 = parseISO(opts.now).getTime()
  const fromY = Math.max(0, (parseISO(achieveDate).getTime() - t0) / MS_PER_YEAR)
  const toY = (parseISO(opts.horizon).getTime() - t0) / MS_PER_YEAR
  if (!umbrellas || umbrellas.length === 0) return curve.area(fromY, toY, opts.halfLifeMonths)
  return multipliedArea(curve, fromY, toY, opts.halfLifeMonths, umbrellas, goal.id)
}

/**
 * Build the umbrella multiplier from a set of goals, each switched on at the
 * date `achieveDateOf` returns — skipping non-umbrellas and any whose date is
 * null (e.g. an unscheduled umbrella). Pure: curves are built once here.
 */
export function umbrellaSources(
  goals: Goal[],
  opts: HappinessOptions,
  achieveDateOf: (g: Goal) => ISODate | null | undefined,
): UmbrellaSource[] {
  const t0 = parseISO(opts.now).getTime()
  const sources: UmbrellaSource[] = []
  for (const g of goals) {
    if (!g.umbrella) continue
    const date = achieveDateOf(g)
    if (!date) continue
    const fromYear = Math.max(0, (parseISO(date).getTime() - t0) / MS_PER_YEAR)
    sources.push({ curve: new RatingCurve(g.value, opts.now), boost: g.umbrella.boost, fromYear, goalId: g.id })
  }
  return sources
}

/** Total happiness already banked from achieved (`done`) goals, umbrellas included. */
export function bankedHappiness(goals: Goal[], opts: HappinessOptions): number {
  const done = goals.filter((g) => g.status === 'done' && g.doneDate)
  const umbrellas = umbrellaSources(done, opts, (g) => g.doneDate)
  return done.reduce((sum, g) => sum + goalHappiness(g, g.doneDate!, opts, umbrellas), 0)
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
 *
 * Goals sharing a `groupId` are alternatives: once one is chosen its siblings
 * are skipped. This static knapsack never sequences an upgrade — that's the
 * time-aware {@link planGoalsScheduled}'s job; here a group simply yields its
 * single best-value member.
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
  const claimedGroups = new Set<string>()
  let spend = 0
  let happiness = 0
  for (const s of scores) {
    const group = s.goal.groupId
    const excluded = group != null && claimedGroups.has(group)
    if (!excluded && spend + s.cost <= budget && s.happiness > 0) {
      chosen.push(s)
      spend += s.cost
      happiness += s.happiness
      if (group != null) claimedGroups.add(group)
    } else {
      skipped.push(s)
    }
  }
  return { chosen, skipped, budget, spend, happiness }
}

/** One goal placed on the timeline by {@link planGoalsScheduled}. */
export interface ScheduledGoal {
  goal: Goal
  /**
   * Money this leg commits. For a plain goal it's `goal.cost`; for the costlier
   * half of an upgrade it's the incremental switch cost (new minus the older
   * item's resale value), so the schedule's total `spend` adds up correctly.
   */
  cost: number
  /** the date this plan achieves the goal on (a grid date ≥ now) */
  achieveDate: ISODate
  /** discounted happiness banked by achieving it on {@link achieveDate} */
  happiness: number
  /** the priority heuristic: happiness-if-achieved-now per unit cost */
  density: number
  /** the alternative-set this goal belongs to, if any */
  groupId?: string
  /** when a cheaper member is replaced by an upgrade — its worth is counted only to here */
  until?: ISODate
  /** for the costlier half of an upgrade: the id of the cheaper goal it replaces */
  upgradeFrom?: string
}

/** A goal the schedule leaves out, with why. */
export interface DroppedGoal {
  goal: Goal
  cost: number
  /** happiness it would bank if achieved now — for ranking the leftovers */
  happiness: number
  density: number
  /**
   * `unaffordable`: the pot never covers it. `not-worth-it`: zero happiness.
   * `alternative`: a sibling in its group was chosen instead.
   */
  reason: 'unaffordable' | 'not-worth-it' | 'alternative'
}

export interface ScheduledPlan {
  /** goals to achieve, each on its own date, soonest first */
  scheduled: ScheduledGoal[]
  /** goals left out of the plan */
  dropped: DroppedGoal[]
  /** total discounted happiness the schedule unlocks */
  happiness: number
  /** total money the schedule commits (sum of scheduled costs) */
  spend: number
}

export interface ScheduleOptions extends HappinessOptions {
  /** candidate achieve dates, ascending; `grid[0]` is the planning anchor (now) */
  grid: ISODate[]
  /** funding pot (base currency) at each grid date, assuming *no* goal spends */
  budgetCurve: number[]
  /** how many partial schedules to carry through the beam search (default 16) */
  beamWidth?: number
  /** alternative-sets the goals reference by `groupId` — drives exclusion & upgrades */
  groups?: GoalGroup[]
}

/** A balance this small counts as an empty pot — avoids dividing by ~0 growth. */
const POT_EPS = 1e-6

/**
 * Schedule open goals across time to maximise total discounted happiness.
 *
 * Unlike {@link planGoals} — a static knapsack that buys everything affordable
 * *today* — this reads the funding pot as a **trajectory** (`budgetCurve`) and
 * picks an achieve-*date* for each goal. Because spending money stops it
 * compounding, sometimes the best move is to *wait*: let the pot grow so a
 * goal you can't afford now (or a second goal you'd otherwise have to drop)
 * fits later. A spend of `C` at grid step `k` is modelled as forgoing the
 * growth that money would have earned — it shaves `C × pot(t)/pot(k)` off the
 * pot at every later step `t`, so early spending genuinely costs future budget.
 *
 * The search is a beam over (goal → date | drop) decisions, taken in
 * happiness-per-cost order. When the pot is flat (no growth) waiting never pays
 * and this collapses back to the greedy knapsack — same answer as `planGoals`.
 */
export function planGoalsScheduled(goals: Goal[], opts: ScheduleOptions): ScheduledPlan {
  const { grid, budgetCurve, beamWidth = 16 } = opts
  const open = goals.filter((g) => g.status === 'open')
  if (open.length === 0 || grid.length === 0) {
    return { scheduled: [], dropped: [], happiness: 0, spend: 0 }
  }

  const t0 = parseISO(opts.now).getTime()
  const yearOf = (d: ISODate) => Math.max(0, (parseISO(d).getTime() - t0) / MS_PER_YEAR)
  const horizonY = (parseISO(opts.horizon).getTime() - t0) / MS_PER_YEAR
  const gridY = grid.map(yearOf)
  const half = opts.halfLifeMonths
  const groupMap = new Map((opts.groups ?? []).map((gr) => [gr.id, gr]))
  const lossOf = (groupId: string | undefined) => {
    const gr = groupId != null ? groupMap.get(groupId) : undefined
    return gr?.upgradeLoss ?? DEFAULT_UPGRADE_LOSS
  }

  // Umbrellas already achieved lift the whole plan from the off — their spend is
  // banked, but they amplify everything we schedule under them.
  const doneUmbrellas = umbrellaSources(
    goals.filter((g) => g.status === 'done' && g.doneDate),
    opts,
    (g) => g.doneDate,
  )

  // One goal's discounted happiness banked over [`fromY`,`toY`], under `sources`.
  const hapTo = (curve: RatingCurve, fromY: number, toY: number, sources: UmbrellaSource[], exclude: string) =>
    sources.length === 0
      ? curve.area(fromY, toY, half)
      : multipliedArea(curve, fromY, toY, half, sources, exclude)
  // ...the common case: held all the way to the horizon.
  const hap = (curve: RatingCurve, fromY: number, sources: UmbrellaSource[], exclude: string) =>
    hapTo(curve, fromY, horizonY, sources, exclude)

  // Precompute each goal's curve; price it against the already-active umbrellas
  // to fix the order we *consider* it in (umbrellas first — see the sort).
  const scored = open.map((goal) => {
    const cost = Math.max(0, goal.cost)
    const curve = new RatingCurve(goal.value, opts.now)
    const baseHappiness = hap(curve, gridY[0], doneUmbrellas, goal.id)
    const density = cost <= 0 ? Infinity : baseHappiness / cost
    return { goal, cost, curve, baseHappiness, density, isUmbrella: !!goal.umbrella }
  })
  // Consider umbrellas before ordinary goals, so by the time we price a regular
  // goal the multiplier acting on it is already fixed in the state. Within each
  // group: best bang-for-buck first, ties broken by raw happiness.
  scored.sort(
    (a, b) =>
      Number(b.isUmbrella) - Number(a.isUmbrella) ||
      b.density - a.density ||
      b.baseHappiness - a.baseHappiness,
  )

  // The pot at grid step `t`, after a set of dated spends, each spend losing the
  // growth it would have earned between its step and `t`.
  type Commit = { grid: number; cost: number }
  const potAt = (t: number, commits: Commit[]): number => {
    let v = budgetCurve[t]
    for (const c of commits) {
      if (c.grid > t) continue
      const baseK = budgetCurve[c.grid]
      const grow = baseK > POT_EPS ? budgetCurve[t] / baseK : 1
      v -= c.cost * grow
    }
    return v
  }
  // A schedule is feasible when no dated spend ever drives the pot negative.
  const feasible = (commits: Commit[]): boolean => {
    for (let t = 0; t < grid.length; t++) {
      if (potAt(t, commits) < -POT_EPS) return false
    }
    return true
  }

  // Beam search. A state is a decision per considered goal: a grid index, or -1
  // to drop, plus the umbrellas switched on so far (so ordinary goals after them
  // are priced with the lift). We extend one goal at a time, keeping the happiest.
  type State = { decisions: number[]; commits: Commit[]; sources: UmbrellaSource[]; happiness: number }
  let beam: State[] = [{ decisions: [], commits: [], sources: doneUmbrellas, happiness: 0 }]

  for (let i = 0; i < scored.length; i++) {
    const g = scored[i]
    const group = groupMap.get(g.goal.groupId ?? '')
    const children: State[] = []
    for (const st of beam) {
      // always an option to drop this goal
      children.push({ decisions: [...st.decisions, -1], commits: st.commits, sources: st.sources, happiness: st.happiness })

      // Scheduled siblings from the same alternative-set. A sequence is capped at
      // two (cheap→premium), so 0 means the slot is free, 1 means the only way to
      // also take `g` is an upgrade, and 2 means the pair is full — `g` must drop.
      const sibs: { index: number; grid: number; scored: typeof scored[number] }[] = []
      if (g.goal.groupId != null) {
        for (let j = 0; j < i; j++) {
          if (scored[j].goal.groupId === g.goal.groupId && st.decisions[j] >= 0) {
            sibs.push({ index: j, grid: st.decisions[j], scored: scored[j] })
          }
        }
      }
      const sib = sibs.length === 1 ? sibs[0] : undefined

      if (sibs.length > 0) {
        // A sibling already holds this slot. The only way to also take `g` is an
        // *upgrade* of a lone cheaper sibling: buy `g` strictly later, replacing it
        // and paying the switch cost. Otherwise `g` just drops (handled above). A
        // different sibling winning the slot is covered by the drop-this-one branch.
        if (sib && group?.upgradable && g.cost > sib.scored.cost) {
          const loss = lossOf(g.goal.groupId)
          const incremental = g.cost - sib.scored.cost * (1 - loss)
          for (let d = sib.grid + 1; d < grid.length; d++) {
            const hG = hap(g.curve, gridY[d], st.sources, g.goal.id)
            if (hG <= 0) continue
            const commits = incremental > 0 ? [...st.commits, { grid: d, cost: incremental }] : st.commits
            if (incremental > 0 && !feasible(commits)) continue
            // The cheaper sibling now only earns happiness up to the swap date.
            const cheaperFull = hap(sib.scored.curve, gridY[sib.grid], st.sources, sib.scored.goal.id)
            const cheaperCut = hapTo(sib.scored.curve, gridY[sib.grid], gridY[d], st.sources, sib.scored.goal.id)
            const sources = g.isUmbrella
              ? [...st.sources, { curve: g.curve, boost: g.goal.umbrella!.boost, fromYear: gridY[d], goalId: g.goal.id }]
              : st.sources
            children.push({
              decisions: [...st.decisions, d],
              commits,
              sources,
              happiness: st.happiness - cheaperFull + cheaperCut + hG,
            })
          }
        }
      } else {
        // ...no sibling holds the slot — achieve `g` on any date that stays feasible.
        for (let d = 0; d < grid.length; d++) {
          const h = hap(g.curve, gridY[d], st.sources, g.goal.id)
          if (h <= 0) continue
          const commits = g.cost > 0 ? [...st.commits, { grid: d, cost: g.cost }] : st.commits
          if (g.cost > 0 && !feasible(commits)) continue
          const sources = g.isUmbrella
            ? [...st.sources, { curve: g.curve, boost: g.goal.umbrella!.boost, fromYear: gridY[d], goalId: g.goal.id }]
            : st.sources
          children.push({ decisions: [...st.decisions, d], commits, sources, happiness: st.happiness + h })
        }
      }
    }
    children.sort((a, b) => b.happiness - a.happiness)
    beam = children.slice(0, beamWidth)
  }

  const best = beam[0] ?? { decisions: scored.map(() => -1), commits: [], sources: doneUmbrellas, happiness: 0 }

  // Recognise upgrade pairs: a group that placed two members runs the cheaper
  // one first, then upgrades to the costlier later. The earlier member is
  // superseded at the swap date; the later one is the upgrade target.
  const scheduledByGroup = new Map<string, number[]>()
  scored.forEach((s, i) => {
    const gid = s.goal.groupId
    if (gid != null && (best.decisions[i] ?? -1) >= 0) {
      const arr = scheduledByGroup.get(gid) ?? []
      arr.push(i)
      scheduledByGroup.set(gid, arr)
    }
  })
  const supersededAt = new Map<number, number>() // scored index → grid index of the swap
  const upgradeFromId = new Map<number, string>() // scored index → cheaper goal id
  for (const arr of scheduledByGroup.values()) {
    arr.sort((a, b) => best.decisions[a] - best.decisions[b])
    if (arr.length >= 2) {
      const cheaper = arr[0]
      const target = arr[arr.length - 1]
      supersededAt.set(cheaper, best.decisions[target])
      upgradeFromId.set(target, scored[cheaper].goal.id)
    }
  }

  // Report each placed goal against the *final* multiplier field, so the rows
  // and total agree — a goal scheduled early still shows the lift of an umbrella
  // the plan adds after it.
  const scheduled: ScheduledGoal[] = []
  const dropped: DroppedGoal[] = []
  scored.forEach((s, i) => {
    const d = best.decisions[i] ?? -1
    if (d >= 0) {
      const cutIdx = supersededAt.get(i)
      const toY = cutIdx != null ? gridY[cutIdx] : horizonY
      const from = upgradeFromId.get(i)
      // The upgrade target commits only the incremental switch cost — the new
      // item's price net of the older one's resale value.
      let cost = s.cost
      if (from != null) {
        const cheaper = scored.find((x) => x.goal.id === from)!
        cost = s.cost - cheaper.cost * (1 - lossOf(s.goal.groupId))
      }
      scheduled.push({
        goal: s.goal,
        cost,
        achieveDate: grid[d],
        happiness: hapTo(s.curve, gridY[d], toY, best.sources, s.goal.id),
        density: s.density,
        groupId: s.goal.groupId,
        until: cutIdx != null ? grid[cutIdx] : undefined,
        upgradeFrom: from,
      })
    } else {
      // A losing alternative vs. worth nothing vs. couldn't be fitted in budget.
      const reason: DroppedGoal['reason'] =
        s.goal.groupId != null && scheduledByGroup.has(s.goal.groupId)
          ? 'alternative'
          : s.baseHappiness <= 0
            ? 'not-worth-it'
            : 'unaffordable'
      dropped.push({ goal: s.goal, cost: s.cost, happiness: s.baseHappiness, density: s.density, reason })
    }
  })
  scheduled.sort((a, b) => a.achieveDate.localeCompare(b.achieveDate) || b.density - a.density)
  const happiness = scheduled.reduce((sum, s) => sum + s.happiness, 0)
  const spend = scheduled.reduce((sum, s) => sum + s.cost, 0)
  return { scheduled, dropped, happiness, spend }
}

/**
 * A goal's spend, split evenly across the funding pool (`fundingBoxIds`), each
 * leg in that box's own currency-agnostic *base* amount. Used to draw the cost
 * out of the projection on the day a goal is achieved. When the pool is empty
 * nothing is drawn (goals are advisory markers only).
 */
export function goalFundingLegs(goal: Goal, fundingBoxIds: string[]): { boxId: string; baseAmount: number }[] {
  if (fundingBoxIds.length === 0) return []
  const each = goal.cost / fundingBoxIds.length
  return fundingBoxIds.map((boxId) => ({ boxId, baseAmount: each }))
}
