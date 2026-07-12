/**
 * The projection engine — pure, deterministic, framework-free.
 *
 * Given the world (boxes, their effects and forwarding rules, and the stream of
 * transactions) it steps every box forward through time *together* — because
 * forwarding couples them — and rolls the result into a net-worth trajectory in
 * the base currency, tracking both the nominal number and its inflation-adjusted
 * (real) shadow.
 *
 * The heavy lifting lives in {@link FlowNetwork}: this module turns the world
 * into a sorted stream of events (a box opening, money leaving, money arriving)
 * and a set of sample times, then walks the network through them.
 */
import { format, parseISO } from 'date-fns'
import { realDiscount } from './effects'
import { FlowNetwork } from './flow'
import { toBase, convert } from './money'
import { occurrencesBetween } from './recurrence'
import type {
  Box,
  CurrencyCode,
  FinanceState,
  Goal,
  ISODate,
  ISODateTime,
  Settings,
  Transaction,
  TxKind,
} from './types'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000
const iso = (t: number): ISODate => format(new Date(t), 'yyyy-MM-dd')

export interface ProjectionPoint {
  date: ISODate
  t: number // epoch ms — convenient for d3 scales
  nominal: number // base currency
  real: number // base currency, today's purchasing power
  perBox: Record<string, number> // nominal in base currency, for stacking
}

/** A goal achieved on the timeline — drawn as a flag on the projection. */
export interface Marker {
  id: string
  label: string
  date: ISODate
  /** spend taken out of net worth at this date (base currency) */
  cost: number
  color: string
  /** a planner-scheduled (not yet achieved) buy, forecast onto the timeline */
  planned?: boolean
}

/**
 * A planner-scheduled buy not yet achieved, forecast onto the projection as a
 * future outflow so time-travel shows the money leaving on its planned date.
 * Derived on the fly from the plan, never persisted — exactly like the synthetic
 * expense a `done` goal makes, but for an `open` goal the planner intends to buy.
 */
export interface PlannedBuy {
  id: string
  label: string
  date: ISODate
  /** base-currency spend this leg commits (the plan's cost, incl. upgrade legs) */
  cost: number
  color: string
  createdAt: ISODateTime
}

export interface ProjectionResult {
  points: ProjectionPoint[]
  markers: Marker[]
  from: ISODate
  to: ISODate
  baseCurrency: CurrencyCode
  currentNominal: number
  endNominal: number
  endReal: number
}

export interface ProjectionOptions {
  from: ISODate
  to: ISODate
  steps?: number // number of sample points (default 96)
}

interface Occurrence {
  t: number
  kind: TxKind
  boxId: string
  toBoxId?: string
  amount: number
  currency: CurrencyCode
}

/** Expand one transaction into concrete dated occurrences within [from, to]. */
function expand(tx: Transaction, from: ISODate, to: ISODate): Occurrence[] {
  const dates = tx.recurrence
    ? occurrencesBetween(tx.recurrence, from, to)
    : tx.date >= from && tx.date <= to
      ? [tx.date]
      : []
  return dates.map((date) => ({
    t: parseISO(date).getTime(),
    kind: tx.kind,
    boxId: tx.boxId,
    toBoxId: tx.toBoxId,
    amount: tx.amount,
    currency: tx.currency,
  }))
}

/** Split one base-currency spend across the funding pool as synthetic expenses. */
function poolExpenses(
  id: string,
  date: ISODate,
  cost: number,
  pool: string[],
  baseCurrency: CurrencyCode,
  createdAt: ISODateTime,
): Transaction[] {
  if (pool.length === 0) return []
  const each = cost / pool.length
  return pool.map((boxId) => ({
    id: `${id}-${boxId}`,
    kind: 'expense' as const,
    boxId,
    amount: each, // base currency; simulate converts into the box
    currency: baseCurrency,
    date,
    createdAt,
  }))
}

/**
 * Turn achieved (`done`) goals — and any `planned` buys the caller forecasts —
 * into synthetic expenses, so the money they cost actually leaves the projection.
 * Each spend is split across the goal-funding pool (the boxes in `boxes` with
 * {@link Box.fundsGoals} set); each leg rides through `simulate` as a plain
 * base-currency expense and is converted into the box's currency there. When
 * nothing funds goals the spend lands nowhere — the goals are advisory markers
 * only. These are computed on the fly, never persisted, never in the activity feed.
 */
function goalOutflows(
  goals: Goal[],
  boxes: Box[],
  baseCurrency: CurrencyCode,
  planned: PlannedBuy[] = [],
): Transaction[] {
  const pool = boxes.filter((b) => b.fundsGoals).map((b) => b.id)
  const out: Transaction[] = []
  for (const g of goals) {
    if (g.status !== 'done' || !g.doneDate) continue
    out.push(...poolExpenses(`goal-${g.id}`, g.doneDate, g.cost, pool, baseCurrency, g.createdAt))
  }
  for (const p of planned) {
    out.push(...poolExpenses(`planned-${p.id}`, p.date, p.cost, pool, baseCurrency, p.createdAt))
  }
  return out
}

// Same-instant ordering: a box opens, then money leaves, then money arrives —
// so an inflow sees the up-to-date balance its acceptance curve depends on.
type SimEvent =
  | { t: number; ord: 0; kind: 'open'; id: string }
  | { t: number; ord: 1; kind: 'out'; id: string; amount: number }
  | { t: number; ord: 2; kind: 'in'; id: string; amount: number }
  | { t: number; ord: 3; kind: 'sample'; index: number }

/**
 * Walk `boxes` through time and record each box's value (its own currency) at
 * every sample time. Inflows are *deposited* into the network so they cascade
 * through forwards; outflows are plain withdrawals.
 */
function simulate(
  boxes: Box[],
  transactions: Transaction[],
  settings: Settings,
  sampleTimes: number[],
): Record<string, number[]> {
  const byId = new Map(boxes.map((b) => [b.id, b]))
  const inBox = (amount: number, from: CurrencyCode, to: CurrencyCode) =>
    convert(amount, from, to, settings)

  // Expand transactions from the earliest opening (to capture past flows that
  // shape today's balances) through the last sample.
  const firstSample = sampleTimes[0] ?? 0
  const lastSample = sampleTimes[sampleTimes.length - 1] ?? firstSample
  const earliestOpen = boxes.reduce(
    (m, b) => Math.min(m, parseISO(b.openingDate).getTime()),
    firstSample,
  )
  const fromISO = iso(Math.min(earliestOpen, firstSample))
  const toISO = iso(lastSample)
  const occ = transactions.flatMap((tx) => expand(tx, fromISO, toISO))

  const events: SimEvent[] = []
  for (const b of boxes) {
    events.push({ t: parseISO(b.openingDate).getTime(), ord: 0, kind: 'open', id: b.id })
  }
  for (const o of occ) {
    const src = byId.get(o.boxId)
    if ((o.kind === 'expense' || o.kind === 'transfer') && src) {
      events.push({ t: o.t, ord: 1, kind: 'out', id: src.id, amount: inBox(o.amount, o.currency, src.currency) })
    }
    if (o.kind === 'income' && src) {
      events.push({ t: o.t, ord: 2, kind: 'in', id: src.id, amount: inBox(o.amount, o.currency, src.currency) })
    }
    if (o.kind === 'transfer' && o.toBoxId) {
      const dst = byId.get(o.toBoxId)
      if (dst) events.push({ t: o.t, ord: 2, kind: 'in', id: dst.id, amount: inBox(o.amount, o.currency, dst.currency) })
    }
  }
  sampleTimes.forEach((t, index) => events.push({ t, ord: 3, kind: 'sample', index }))

  events.sort((a, b) => a.t - b.t || a.ord - b.ord)

  const net = new FlowNetwork(boxes, settings)
  const out: Record<string, number[]> = {}
  for (const b of boxes) out[b.id] = new Array(sampleTimes.length).fill(0)

  for (const ev of events) {
    net.setClock(ev.t)
    switch (ev.kind) {
      case 'open':
        net.open(ev.id)
        break
      case 'out':
        net.withdraw(ev.id, ev.amount)
        break
      case 'in':
        net.deposit(ev.id, ev.amount)
        break
      case 'sample': {
        const snap = net.snapshot()
        for (const b of boxes) out[b.id][ev.index] = snap[b.id]
        break
      }
    }
  }
  return out
}

export function project(
  state: FinanceState,
  opts: ProjectionOptions,
  plannedBuys: PlannedBuy[] = [],
): ProjectionResult {
  const { settings } = state
  const goals = state.goals ?? []
  const active = state.boxes.filter((b) => !b.archived)
  const fromT = parseISO(opts.from).getTime()
  const toT = parseISO(opts.to).getTime()
  const steps = Math.max(2, opts.steps ?? 96)

  const sampleTimes = Array.from(
    { length: steps },
    (_, i) => fromT + ((toT - fromT) * i) / (steps - 1),
  )
  const sampleDates = sampleTimes.map(iso)

  const txns = [...state.transactions, ...goalOutflows(goals, active, settings.baseCurrency, plannedBuys)]
  const series = simulate(active, txns, settings, sampleTimes)
  const perBoxBase: Record<string, number[]> = {}
  for (const box of active) {
    perBoxBase[box.id] = series[box.id].map((v) => toBase(v, box.currency, settings))
  }

  const infl = settings.inflation ?? 0
  const points: ProjectionPoint[] = sampleTimes.map((t, i) => {
    const years = Math.max(0, (t - fromT) / MS_PER_YEAR)
    const globalDiscount = infl ? 1 / (1 + infl) ** years : 1
    const perBox: Record<string, number> = {}
    let nominal = 0
    let real = 0
    for (const box of active) {
      const v = perBoxBase[box.id][i]
      perBox[box.id] = v
      nominal += v
      real += v * realDiscount(box.effects, years)
    }
    return { date: sampleDates[i], t, nominal, real: real * globalDiscount, perBox }
  })

  const inWindow = (d: ISODate) => d >= opts.from && d <= opts.to
  const markers: Marker[] = [
    ...goals
      .filter((g) => g.status === 'done' && g.doneDate && inWindow(g.doneDate))
      .map((g) => ({ id: g.id, label: g.name, date: g.doneDate!, cost: g.cost, color: g.color })),
    ...plannedBuys
      .filter((p) => inWindow(p.date))
      .map((p) => ({ id: `planned-${p.id}`, label: p.label, date: p.date, cost: p.cost, color: p.color, planned: true })),
  ]

  const currentNominal = points[0]?.nominal ?? 0
  return {
    points,
    markers,
    from: opts.from,
    to: opts.to,
    baseCurrency: settings.baseCurrency,
    currentNominal,
    endNominal: points.at(-1)?.nominal ?? 0,
    endReal: points.at(-1)?.real ?? 0,
  }
}

/**
 * Nominal value of a single box on a date, in the box's own currency.
 *
 * Runs the whole active network (forwarding makes a box's balance depend on its
 * neighbours), then reads off the one box. If the box is archived it's projected
 * on its own.
 */
export function boxValueAt(
  state: FinanceState,
  boxId: string,
  dateISO: ISODate,
  plannedBuys: PlannedBuy[] = [],
): number {
  const active = state.boxes.filter((b) => !b.archived)
  const boxes = active.some((b) => b.id === boxId)
    ? active
    : state.boxes.filter((b) => b.id === boxId)
  const txns = [...state.transactions, ...goalOutflows(state.goals ?? [], boxes, state.settings.baseCurrency, plannedBuys)]
  const series = simulate(boxes, txns, state.settings, [parseISO(dateISO).getTime()])
  return series[boxId]?.[0] ?? 0
}

/**
 * The transaction that would carry a box's balance to `target` as of
 * `dateISO` — an income if it's under, an expense if it's over. Null if the
 * box is already there (or doesn't exist).
 */
export function balanceAdjustment(
  state: FinanceState,
  boxId: string,
  target: number,
  dateISO: ISODate,
): Omit<Transaction, 'id' | 'createdAt'> | null {
  const box = state.boxes.find((b) => b.id === boxId)
  if (!box) return null
  const delta = target - boxValueAt(state, boxId, dateISO)
  if (Math.abs(delta) < 0.005) return null
  return {
    kind: delta > 0 ? 'income' : 'expense',
    boxId,
    amount: Math.abs(delta),
    currency: box.currency,
    note: 'Balance adjustment',
    date: dateISO,
  }
}

/** Total net worth on a date, in the base currency. */
export function netWorthAt(state: FinanceState, dateISO: ISODate, plannedBuys: PlannedBuy[] = []): number {
  const active = state.boxes.filter((b) => !b.archived)
  const txns = [...state.transactions, ...goalOutflows(state.goals ?? [], active, state.settings.baseCurrency, plannedBuys)]
  const series = simulate(active, txns, state.settings, [parseISO(dateISO).getTime()])
  return active.reduce(
    (sum, b) => sum + toBase(series[b.id][0], b.currency, state.settings),
    0,
  )
}

/** A box that funds a goal, valued on a date in the base currency. */
export interface GoalFundingBox {
  boxId: string
  base: number
}

/**
 * The goal-funding pool — every box with {@link Box.fundsGoals} set — each
 * valued on `dateISO` in the base currency. Goals draw their cost from this
 * pool, so its combined balance *is* the planner's budget; there's no separate
 * number to keep in sync. Boxes already drained by achieved goals reflect their
 * reduced value. Archived boxes are skipped.
 */
export function goalFundingBoxes(state: FinanceState, dateISO: ISODate): GoalFundingBox[] {
  const active = state.boxes.filter((b) => !b.archived)
  const pool = active.filter((b) => b.fundsGoals)
  if (pool.length === 0) return []
  const txns = [...state.transactions, ...goalOutflows(state.goals ?? [], active, state.settings.baseCurrency)]
  const series = simulate(active, txns, state.settings, [parseISO(dateISO).getTime()])
  return pool.map((b) => ({ boxId: b.id, base: toBase(series[b.id][0], b.currency, state.settings) }))
}

/** The planner's spendable budget: the summed base value of {@link goalFundingBoxes}. */
export function goalFundingBudget(state: FinanceState, dateISO: ISODate): number {
  return goalFundingBoxes(state, dateISO).reduce((sum, f) => sum + f.base, 0)
}

/**
 * The funding pot's *trajectory* (base currency) across `grid` — the same boxes
 * {@link goalFundingBudget} sums, but valued at every grid date so the
 * time-aware planner can see the budget grow. No open-goal spends are baked in
 * (those are what the planner is deciding); spends from already-achieved goals
 * are, since they've really left. Returns zeros when nothing funds open goals.
 */
export function goalBudgetCurve(state: FinanceState, grid: ISODate[]): number[] {
  const active = state.boxes.filter((b) => !b.archived)
  const funders = active.filter((b) => b.fundsGoals)
  if (funders.length === 0 || grid.length === 0) return grid.map(() => 0)
  const txns = [...state.transactions, ...goalOutflows(state.goals ?? [], active, state.settings.baseCurrency)]
  const series = simulate(active, txns, state.settings, grid.map((d) => parseISO(d).getTime()))
  return grid.map((_, i) =>
    funders.reduce((sum, b) => sum + toBase(series[b.id][i], b.currency, state.settings), 0),
  )
}
