/**
 * What-if scenarios for the Planning studio.
 *
 * A scenario is a thin, reversible overlay on top of the real world: it nudges
 * the recurring income/expense "rates" — either in bulk (all income, all
 * expenses) or line by line (a percentage change, or a fixed replacement
 * amount) — and hands back a fresh FinanceState the projection engine can run
 * unchanged. Nothing here mutates the store until the user explicitly saves.
 */
import {
  occurrencesPerYear,
  roundMoney,
  toBase,
  type FinanceState,
  type Transaction,
} from '@/domain'
import { newId } from '@/lib/id'
import { SWATCHES } from '@/lib/palette'

export type AdjMode = 'pct' | 'fixed'
export type FlowKind = 'income' | 'expense'

/** A per-flow override of its base amount. */
export interface LineAdj {
  mode: AdjMode
  /** pct → percent change (10 = +10%); fixed → the new absolute per-occurrence amount */
  value: number
}

export interface Scenario {
  id: string
  name: string
  color: string
  /** bulk percentage nudge applied to every flow of a kind lacking a per-line override */
  bulk: Record<FlowKind, number>
  /** txId → per-line override (wins over the bulk nudge) */
  lines: Record<string, LineAdj>
  /** whether this scenario's line is drawn on the chart */
  hidden?: boolean
}

/** The recurring income/expense flows — the "rates" a scenario can bend. */
export function isFlow(tx: Transaction): tx is Transaction & { kind: FlowKind } {
  return !!tx.recurrence && (tx.kind === 'income' || tx.kind === 'expense')
}

/** The adjusted per-occurrence amount of a flow under a scenario (own currency). */
export function adjustedAmount(tx: Transaction, sc: Scenario): number {
  const line = sc.lines[tx.id]
  if (line) {
    const next = line.mode === 'fixed' ? line.value : tx.amount * (1 + line.value / 100)
    return Math.max(0, next)
  }
  if (tx.kind === 'income' || tx.kind === 'expense') {
    const b = sc.bulk[tx.kind] ?? 0
    return Math.max(0, tx.amount * (1 + b / 100))
  }
  return tx.amount
}

/** A scenario applied to the world — feed straight into `project()`. */
export function applyScenario(state: FinanceState, sc: Scenario): FinanceState {
  return {
    ...state,
    transactions: state.transactions.map((tx) =>
      isFlow(tx) ? { ...tx, amount: adjustedAmount(tx, sc) } : tx,
    ),
  }
}

export interface Flow {
  tx: Transaction & { kind: FlowKind }
  kind: FlowKind
  perYear: number
  /** baseline annualised value, in base currency */
  annualBase: number
}

/** Every recurring flow, annualised into base currency, biggest first. */
export function recurringFlows(state: FinanceState): Flow[] {
  return state.transactions
    .filter(isFlow)
    .map((tx) => {
      const perYear = tx.recurrence ? occurrencesPerYear(tx.recurrence) : 1
      return {
        tx,
        kind: tx.kind,
        perYear,
        annualBase: toBase(tx.amount * perYear, tx.currency, state.settings),
      }
    })
    .sort((a, b) => b.annualBase - a.annualBase)
}

/** A flow's annualised value (base currency) under a scenario. */
export function flowAnnual(flow: Flow, sc: Scenario, state: FinanceState): number {
  return toBase(adjustedAmount(flow.tx, sc) * flow.perYear, flow.tx.currency, state.settings)
}

/** Net annual flow (income − expense) in base currency under a scenario. */
export function netAnnual(state: FinanceState, sc: Scenario): number {
  return recurringFlows(state).reduce((sum, f) => {
    const a = flowAnnual(f, sc, state)
    return sum + (f.kind === 'income' ? a : -a)
  }, 0)
}

export interface FlowChange {
  txId: string
  from: number
  to: number
}

/** The flows whose amount the scenario actually changes (rounded to currency). */
export function scenarioChanges(state: FinanceState, sc: Scenario): FlowChange[] {
  const out: FlowChange[] = []
  for (const tx of state.transactions) {
    if (!isFlow(tx)) continue
    const to = roundMoney(adjustedAmount(tx, sc), tx.currency)
    if (to !== roundMoney(tx.amount, tx.currency)) out.push({ txId: tx.id, from: tx.amount, to })
  }
  return out
}

export const isDirty = (state: FinanceState, sc: Scenario): boolean =>
  scenarioChanges(state, sc).length > 0

/** A blank scenario — no nudges, picks an unused swatch. */
export function newScenario(name: string, used: string[] = []): Scenario {
  const color = SWATCHES.find((s) => !used.includes(s.hex))?.hex ?? SWATCHES[0].hex
  return { id: newId('scn'), name, color, bulk: { income: 0, expense: 0 }, lines: {} }
}

// ── small immutable editors, so the page stays declarative ──

export function setBulk(sc: Scenario, kind: FlowKind, pct: number): Scenario {
  return { ...sc, bulk: { ...sc.bulk, [kind]: pct } }
}

export function setLine(sc: Scenario, txId: string, adj: LineAdj | null): Scenario {
  const lines = { ...sc.lines }
  if (adj) lines[txId] = adj
  else delete lines[txId]
  return { ...sc, lines }
}

/** Drop every nudge but keep identity (name/color). */
export function clearScenario(sc: Scenario): Scenario {
  return { ...sc, bulk: { income: 0, expense: 0 }, lines: {} }
}
