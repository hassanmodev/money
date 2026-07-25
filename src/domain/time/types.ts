/**
 * Time & Projects — the vocabulary of the time side of the app.
 *
 * A sibling to the money domain, deliberately decoupled: nothing here imports
 * from `domain/` (money), and the money side never imports this. Everything is
 * plain JSON-serializable data; dates are ISO strings, parsed at the boundary.
 *
 * One resolution rules all: 10 minutes. Blocks, budgets, sessions, and the
 * simulation step all snap to it — an hour is six slots, a week is 1008.
 */

export type ISODate = string // 'YYYY-MM-DD'
export type ISODateTime = string // full ISO timestamp

export const STEP_MIN = 10
export const DAY_MIN = 1440
export const WEEK_MIN = 7 * DAY_MIN
export const SLOTS_PER_DAY = DAY_MIN / STEP_MIN // 144
export const SLOTS_PER_WEEK = WEEK_MIN / STEP_MIN // 1008

export type ProjectId = string
export type QualityId = string

// ── Projects ────────────────────────────────────────────────────────────────

/**
 * Give/take on a quality as an opening cost plus a per-hour rate:
 * `cost(h) = open + rate·h` — "3 to open, 1 each more hour". Negative drains,
 * positive gives. Curve shapes (tapering near full, thresholds) are reserved
 * in the model; v1 treats every effect as linear.
 */
export interface QualityEffect {
  quality: QualityId
  open: number
  rate: number // per hour
  curve?: 'linear'
}

/** A project prefers a quality at some value to run well (deep work wants mental ≥ 60). */
export interface QualityRequirement {
  quality: QualityId
  min: number
}

export type BudgetPeriodKind = 'day' | 'week' | 'month' | 'custom'

export interface BudgetPeriod {
  kind: BudgetPeriodKind
  /** kind === 'custom': rolling window length in days */
  days?: number
}

/**
 * What an elastic range means:
 * - `target`: a plain amount, no stretch either way (min === max).
 * - `maximize`: starts at the low end; the sim proposes growth toward the cap.
 * - `minimize`: a habit being fought — under the cap is the goal; over it is
 *   tracked, never punished.
 */
export type BudgetIntent = 'target' | 'maximize' | 'minimize'

/** How sessions want to distribute across the budget period. */
export type Spread = 'cluster' | 'scatter' | 'any'

export interface Budget {
  /** low end in minutes — the committed amount */
  min: number
  /** high end / cap in minutes; === min for a plain target */
  max: number
  intent: BudgetIntent
  period: BudgetPeriod
  /** optional session shaping, minutes per unbroken block */
  sessionMin?: number
  sessionMax?: number
  spread: Spread
}

/** Where an `fr` share draws from: the direct parent's share, the top-level family's, or the global free pool. */
export type FrScope = 'parent' | 'family' | 'global'

export interface FrShare {
  share: number // CSS-style weight; resolved after placed and budgeted claims
  scope: FrScope
}

/**
 * A project is anything that takes time — no type taxonomy. The optional
 * `code` is the only hierarchy mechanism: `ent-screen-phone` reads as the
 * `phone` sub-project of `screen` under `ent`. Sub-projects are ordinary
 * projects that inherit nothing but the naming convention and a roll-up.
 */
export interface Project {
  id: ProjectId
  name: string
  code?: string
  /** hex override; absent means auto-assigned (sub-projects shade the parent hue) */
  color?: string
  budget?: Budget
  fr?: FrShare
  effects: QualityEffect[]
  requires: QualityRequirement[]
  /** render dimmed/hatched as background — sleep is an ordinary project */
  dim?: boolean
  note?: string
  archived?: boolean
  createdAt: ISODateTime
}

// ── Blocks & fragments ──────────────────────────────────────────────────────

export type BlockLayer = 'plan' | 'actual'

/** manual: dragged/typed onto the grid · rule: stamped by a typed rule · suggested: proposed by the sim */
export type BlockOrigin = 'manual' | 'rule' | 'suggested'

export interface Block {
  id: string
  projectId: ProjectId
  layer: BlockLayer
  date: ISODate
  /** minutes from midnight, multiple of STEP_MIN */
  startMin: number
  /** multiple of STEP_MIN; may cross midnight */
  durationMin: number
  /** free-text intent ("deep work on invoice feature") */
  note?: string
  origin: BlockOrigin
  /** for rule-stamped blocks: the rule + occurrence key they came from */
  ruleId?: string
  ruleKey?: string
  createdAt: ISODateTime
}

/**
 * A micro-entry: a project, a duration, a rough time. Deliberately never
 * placed as a block — that lightness is the point. Fragments roll up into
 * project actuals and render as a color-coded edge strip near when they
 * happened.
 */
export interface Fragment {
  id: string
  projectId: ProjectId
  minutes: number
  /** rough time ("just now-ish") */
  at: ISODateTime
  note?: string
  createdAt: ISODateTime
}

// ── Typed rules ─────────────────────────────────────────────────────────────

/** Edits to one rule-generated occurrence, keyed by occurrence key. */
export interface RuleOverride {
  date?: ISODate
  startMin?: number
  durationMin?: number
  note?: string
}

/**
 * A recurring pattern as a small text rule (`mon–fri 9–17`, `first sat 14:00
 * for 2h`). Rules expand to ordinary blocks for any requested week; generated
 * blocks stay individually deletable (`skipped`) and draggable (`overrides`).
 */
export interface TimeRule {
  id: string
  projectId: ProjectId
  text: string
  note?: string
  /** occurrence keys the user deleted */
  skipped: string[]
  /** occurrence keys the user moved or edited */
  overrides: Record<string, RuleOverride>
  createdAt: ISODateTime
}

// ── Qualities ───────────────────────────────────────────────────────────────

export interface CurvePoint {
  minute: number // 0..1439
  value: number
}

/**
 * "when physical < 30, mental −40%": while the watched quality's effective
 * value is below `below`, this quality's effective value is scaled by `scale`.
 * Chains are qualities referencing qualities; cycles are rejected at edit time.
 */
export interface QualityDependency {
  on: QualityId
  below: number
  scale: number
}

/**
 * A user-defined meter that makes hours unequal, clamped [0, max]. Every
 * quality starts the week at full ("perfect"); passive drift relaxes it toward
 * the time-of-day baseline, and blocks give/take from there.
 */
export interface Quality {
  id: QualityId
  name: string
  max: number
  color?: string
  /**
   * The passive-drift attractor: a piecewise-linear curve over the day,
   * wrapping at midnight (mental decays across waking hours, physical
   * recovers overnight). This alone makes 9am ≠ 11pm.
   */
  baseline: CurvePoint[]
  /** relaxation speed toward baseline, fraction per hour (default 0.5) */
  drift?: number
  dependsOn?: QualityDependency[]
}

// ── Settings & state ────────────────────────────────────────────────────────

export interface TimeSettings {
  /** first day of the week, 0 = Monday (default) .. 6 = Sunday */
  weekStart: number
  /**
   * The "living hours" preference: 24 hourly weights 0..1. Filler logic
   * avoids eating prime hours unless nothing else fits. Defaults favor
   * evening personal time.
   */
  primeHours: number[]
  /** warn when a projected quality falls below this fraction of its max (default 0.15) */
  warnBelow?: number
}

/** The whole persisted time world. */
export interface TimeState {
  projects: Project[]
  qualities: Quality[]
  blocks: Block[]
  rules: TimeRule[]
  fragments: Fragment[]
  settings: TimeSettings
}

export const DEFAULT_PRIME_HOURS: number[] = [
  0.7, 0.7, 0.7, 0.7, 0.7, 0.7, // 0–5 night
  0.5, 0.5, 0.4, // 6–8 morning
  0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, // 9–16 midday
  0.4, // 17
  1, 1, 1, 1, 1, // 18–22 evening
  0.8, // 23
]
