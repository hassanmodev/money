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

export interface Milestone {
  id: string
  label: string
  date: ISODate
  value: number
  kind: 'goal' | 'auto'
}

export interface ProjectionResult {
  points: ProjectionPoint[]
  milestones: Milestone[]
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

function detectMilestones(
  points: ProjectionPoint[],
  goals: Goal[],
  start: number,
): Milestone[] {
  const out: Milestone[] = []
  for (const g of goals) {
    if (g.target <= start) continue
    const hit = points.find((p) => p.nominal >= g.target)
    if (hit) {
      out.push({ id: `goal-${g.id}`, label: g.label, date: hit.date, value: g.target, kind: 'goal' })
    }
  }
  if (start > 0) {
    const dbl = points.find((p) => p.nominal >= start * 2)
    if (dbl) {
      out.push({ id: 'auto-double', label: 'Doubles', date: dbl.date, value: start * 2, kind: 'auto' })
    }
  }
  return out
}

export function project(state: FinanceState, opts: ProjectionOptions): ProjectionResult {
  const { settings } = state
  const active = state.boxes.filter((b) => !b.archived)
  const fromT = parseISO(opts.from).getTime()
  const toT = parseISO(opts.to).getTime()
  const steps = Math.max(2, opts.steps ?? 96)

  const sampleTimes = Array.from(
    { length: steps },
    (_, i) => fromT + ((toT - fromT) * i) / (steps - 1),
  )
  const sampleDates = sampleTimes.map(iso)

  const series = simulate(active, state.transactions, settings, sampleTimes)
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

  const currentNominal = points[0]?.nominal ?? 0
  return {
    points,
    milestones: detectMilestones(points, state.goals, currentNominal),
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
): number {
  const active = state.boxes.filter((b) => !b.archived)
  const boxes = active.some((b) => b.id === boxId)
    ? active
    : state.boxes.filter((b) => b.id === boxId)
  const series = simulate(boxes, state.transactions, state.settings, [parseISO(dateISO).getTime()])
  return series[boxId]?.[0] ?? 0
}

/** Total net worth on a date, in the base currency. */
export function netWorthAt(state: FinanceState, dateISO: ISODate): number {
  const active = state.boxes.filter((b) => !b.archived)
  const series = simulate(active, state.transactions, state.settings, [parseISO(dateISO).getTime()])
  return active.reduce(
    (sum, b) => sum + toBase(series[b.id][0], b.currency, state.settings),
    0,
  )
}
