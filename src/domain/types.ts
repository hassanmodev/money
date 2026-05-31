/**
 * Domain types — the vocabulary of the app.
 *
 * Everything here is plain data, serializable to JSON. Dates are stored as ISO
 * strings (`YYYY-MM-DD`) so persistence is trivial; the engine parses them at
 * the boundary. No framework imports live in this folder.
 */

export type ISODate = string // 'YYYY-MM-DD'
export type ISODateTime = string // full ISO timestamp

export type CurrencyCode = string // 'EUR' | 'USD' | 'BTC' | 'XAU' | ...

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

export interface Goal {
  id: string
  label: string
  target: number // in base currency
  color?: string
}

export interface Settings {
  baseCurrency: CurrencyCode
  /** value of 1 unit of a currency expressed in the base currency (base = 1) */
  rates: Record<CurrencyCode, number>
  /** global annual inflation used to discount the whole net worth in the "real" view */
  inflation?: number
}

/** The whole persisted world. */
export interface FinanceState {
  boxes: Box[]
  transactions: Transaction[]
  goals: Goal[]
  settings: Settings
}
