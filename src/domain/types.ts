/**
 * Domain types — the vocabulary of the app.
 *
 * Everything here is plain data, serializable to JSON. Dates are stored as ISO
 * strings (`YYYY-MM-DD`) so persistence is trivial; the engine parses them at
 * the boundary. No framework imports live in this folder.
 */

export type ISODate = string // 'YYYY-MM-DD'
export type ISODateTime = string // full ISO timestamp

export type CurrencyCode = string // 'EUR' | 'USD' | 'EGP' | 'BTC' | 'XAU' | ...

/** What a currency is, for iconography, decimals, and formatting. */
export type CurrencyKind = 'fiat' | 'crypto' | 'metal' | 'custom'

/** Display + precision metadata for a currency. Plain, serializable data. */
export interface CurrencyMeta {
  code: string
  symbol: string
  name: string
  decimals: number
  kind: CurrencyKind
  /** surfaced first in pickers — the global majors plus a few locals */
  popular?: boolean
}

/** The flavour of a money box. Affects iconography and sensible defaults. */
export type BoxKind =
  | 'cash'
  | 'checking'
  | 'savings'
  | 'investment'
  | 'asset'
  | 'crypto'
  | 'custom'

/**
 * A time-based rule attached to a box.
 * - growth kinds (`interest`, `appreciation`) lift the *nominal* value.
 * - nominal-decay kinds (`depreciation`, `fee`) erode the *nominal* value.
 * - `inflation` leaves nominal untouched but eats *real* (purchasing-power) value.
 *
 * `annualRate` is always a positive magnitude (e.g. 0.045 = 4.5%); direction is
 * implied by `kind`.
 */
export type EffectKind =
  | 'interest'
  | 'appreciation'
  | 'inflation'
  | 'depreciation'
  | 'fee'

export type Compounding =
  | 'daily'
  | 'monthly'
  | 'quarterly'
  | 'annually'
  | 'continuous'

export interface Effect {
  id: string
  kind: EffectKind
  label?: string
  annualRate: number // positive fraction; 0.045 = 4.5%
  compounding: Compounding
}

/**
 * One tier of a box's acceptance curve. Read as: "once this box holds `level`
 * (in its own currency), it keeps only `rate` of any further inflow." Points
 * stack into a tank that fills greedily while low and tapers as it crosses each
 * threshold. Below the first point a box keeps everything (rate 1).
 */
export interface AcceptancePoint {
  level: number // balance threshold, box currency, >= 0
  rate: number // fraction kept from here up, 0..1
}

/**
 * A directed spill: a `share` of a box's overflow (the inflow it declines)
 * routed on to another box. Shares are absolute fractions of the overflow;
 * what isn't forwarded stays put. Money is conserved either way.
 */
export interface Forward {
  id: string
  toBoxId: string
  share: number // 0..1
}

export interface Box {
  id: string
  name: string
  kind: BoxKind
  currency: CurrencyCode
  openingBalance: number
  openingDate: ISODate
  color: string // hex from the curated swatch palette
  icon?: string // optional lucide icon name override
  effects: Effect[]
  /**
   * Tiered take-rate for incoming money, ascending by level. Absent or empty
   * means the box keeps everything it's offered.
   */
  acceptance?: AcceptancePoint[]
  /**
   * Where this box spills the inflow it declines. Absent or empty means the box
   * simply keeps whatever its acceptance curve leaves over.
   */
  forwards?: Forward[]
  note?: string
  archived?: boolean
  createdAt: ISODateTime
}

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year'

export type RecurrenceEnd =
  | { type: 'never' }
  | { type: 'on'; date: ISODate }
  | { type: 'after'; count: number }

export interface Recurrence {
  every: number // >= 1
  unit: RecurrenceUnit
  anchor: ISODate // the first occurrence
  end: RecurrenceEnd
}

export type TxKind = 'expense' | 'income' | 'transfer'

export interface Transaction {
  id: string
  kind: TxKind
  /** source box (expense / transfer-out) or destination box (income) */
  boxId: string
  /** destination box for transfers */
  toBoxId?: string
  amount: number // positive magnitude, expressed in `currency`
  currency: CurrencyCode
  category?: string
  note?: string
  date: ISODate
  recurrence?: Recurrence
  createdAt: ISODateTime
}

/**
 * A breakpoint on a goal's worth-over-time curve: from `date` onward its rating
 * holds `value` until the next point. Lets a goal matter more in some seasons
 * than others ("worth 9 this year, 4 once the moment passes").
 */
export interface ValuePoint {
  date: ISODate
  value: number // happiness rating, ~0..10
}

/** A goal's worth as happiness: a flat rating, or a step curve that shifts over time. */
export type GoalValue = number | ValuePoint[]

/** `open` — still wanted. `done` — fulfilled, archived but kept (never deleted). */
export type GoalStatus = 'open' | 'done'

export interface Goal {
  id: string
  label: string
  cost: number // base currency — what it takes to fulfil
  value: GoalValue // happiness rating: a flat number, or points that change over time
  boxIds: string[] // funding boxes; empty = the whole net worth backs it
  color?: string
  note?: string
  status: GoalStatus
  completedDate?: ISODate // when it was marked done, kept for the record
  createdAt: ISODateTime
}

export interface Settings {
  baseCurrency: CurrencyCode
  /** value of 1 unit of a currency expressed in the base currency (base = 1) */
  rates: Record<CurrencyCode, number>
  /** global annual inflation used to discount the whole net worth in the "real" view */
  inflation?: number
  /** how fast future happiness fades vs today's, per year — the goal "patience" knob (default 0.15) */
  happinessDiscount?: number
  /**
   * User edits to the currency catalogue: brand-new custom currencies *and*
   * overrides of built-in ones (matched by `code`). Merged over the JSON
   * defaults to form the live catalogue.
   */
  customCurrencies?: CurrencyMeta[]
}

/** The whole persisted world. */
export interface FinanceState {
  boxes: Box[]
  transactions: Transaction[]
  goals: Goal[]
  settings: Settings
}
