/**
 * The projection engine — pure, deterministic, framework-free.
 *
 * Given the world (boxes, their effects, and the stream of transactions) it
 * simulates each box forward through time and rolls everything up into a
 * net-worth trajectory in the base currency, tracking both the nominal number
 * and its inflation-adjusted (real) shadow.
 */
import { format, parseISO } from 'date-fns'
import { nominalFactor, realDiscount } from './effects'
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

interface Delta {
  t: number
  delta: number // in the box's own currency
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

/** Signed cash movements touching a single box, in that box's currency, sorted. */
function boxDeltas(box: Box, occ: Occurrence[], s: Settings): Delta[] {
  const out: Delta[] = []
  const inBox = (amt: number, cur: CurrencyCode) => convert(amt, cur, box.currency, s)
  for (const o of occ) {
    if (o.kind === 'expense' && o.boxId === box.id) {
      out.push({ t: o.t, delta: -inBox(o.amount, o.currency) })
    } else if (o.kind === 'income' && o.boxId === box.id) {
      out.push({ t: o.t, delta: inBox(o.amount, o.currency) })
    } else if (o.kind === 'transfer') {
      if (o.boxId === box.id) out.push({ t: o.t, delta: -inBox(o.amount, o.currency) })
      if (o.toBoxId === box.id) out.push({ t: o.t, delta: inBox(o.amount, o.currency) })
    }
  }
  out.sort((a, b) => a.t - b.t)
  return out
}

/**
 * Nominal value of a box at each (ascending) sample time. Walks from the
 * opening balance, compounding effects between events and applying each cash
 * movement as it lands.
 */
function nominalSeries(box: Box, deltas: Delta[], sampleTimes: number[]): number[] {
  const openT = parseISO(box.openingDate).getTime()
  let value = box.openingBalance
  let lastT = openT
  let di = 0
  const out: number[] = []

  for (const sT of sampleTimes) {
    while (di < deltas.length && deltas[di].t <= sT) {
      const dT = deltas[di].t
      if (dT > lastT) {
        value *= nominalFactor(box.effects, (dT - lastT) / MS_PER_YEAR)
        lastT = dT
      }
      value += deltas[di].delta
      di++
    }
    if (sT > lastT) {
      value *= nominalFactor(box.effects, (sT - lastT) / MS_PER_YEAR)
      lastT = sT
    }
    out.push(value)
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

  // Expand transactions from the earliest opening (to capture past flows that
  // shape today's balances) all the way to the horizon.
  const earliestOpen = active.reduce(
    (m, b) => Math.min(m, parseISO(b.openingDate).getTime()),
    fromT,
  )
  const expandFrom = iso(Math.min(earliestOpen, fromT))
  const occ = state.transactions.flatMap((tx) => expand(tx, expandFrom, opts.to))

  const perBoxBase: Record<string, number[]> = {}
  for (const box of active) {
    const series = nominalSeries(box, boxDeltas(box, occ, settings), sampleTimes)
    perBoxBase[box.id] = series.map((v) => toBase(v, box.currency, settings))
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

/** Nominal value of a single box on a given date, in the box's own currency. */
export function boxValueAt(
  box: Box,
  transactions: Transaction[],
  settings: Settings,
  dateISO: ISODate,
): number {
  const occ = transactions.flatMap((tx) => expand(tx, box.openingDate, dateISO))
  const [v] = nominalSeries(box, boxDeltas(box, occ, settings), [
    parseISO(dateISO).getTime(),
  ])
  return v
}

/** Total net worth on a date, in the base currency. */
export function netWorthAt(state: FinanceState, dateISO: ISODate): number {
  return state.boxes
    .filter((b) => !b.archived)
    .reduce(
      (sum, b) =>
        sum +
        toBase(boxValueAt(b, state.transactions, state.settings, dateISO), b.currency, state.settings),
      0,
    )
}
