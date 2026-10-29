import { addDays, format, parseISO } from 'date-fns'
import { recurrenceAmountsBetween } from './recurrence'
import type { ActivityBlueprint, ActivityBlueprintVersion, FinanceState, Transaction } from './types'

type ActivityData = Pick<FinanceState, 'transactions' | 'activityBlueprints'>

export class ActivityLedger {
  private readonly state: ActivityData

  constructor(state: ActivityData) { this.state = state }

  static blueprint(tx: Transaction): ActivityBlueprint {
    if (!tx.recurrence) throw new Error('A blueprint needs a recurrence.')
    return { id: tx.id, createdAt: tx.createdAt, versions: [ActivityLedger.version(tx, tx.recurrence.anchor)] }
  }

  migrate(): Required<ActivityData> {
    const transactions: Transaction[] = []
    const activityBlueprints = [...(this.state.activityBlueprints ?? [])]
    for (const tx of this.state.transactions) {
      if (tx.recurrence) activityBlueprints.push(ActivityLedger.blueprint(tx))
      else transactions.push(tx)
    }
    return { transactions, activityBlueprints }
  }

  current(): Transaction[] {
    const out = this.state.transactions.filter((tx) => !!tx.recurrence)
    for (const blueprint of this.state.activityBlueprints ?? []) {
      if (blueprint.stoppedOn) continue
      const version = blueprint.versions.at(-1)
      if (version) out.push(this.asTransaction(blueprint, version))
    }
    return out
  }

  revise(blueprint: ActivityBlueprint, patch: Partial<Transaction>, from: string): ActivityBlueprint {
    const current = blueprint.versions.at(-1)!
    const tx = { ...this.asTransaction(blueprint, current), ...patch, recurrence: patch.recurrence ?? current.recurrence }
    const version = ActivityLedger.version(tx, from)
    const versions = blueprint.versions.filter((v) => v.effectiveFrom < from)
    return { ...blueprint, versions: [...versions, version] }
  }

  between(from: string, to: string): Transaction[] {
    if (from > to) return []
    const out: Transaction[] = []
    const overrides = new Set(this.state.transactions.map((tx) => tx.id))
    for (const tx of this.state.transactions) {
      if (tx.recurrence) {
        out.push(...this.expand(tx, from, to))
      } else if (tx.date >= from && tx.date <= to) out.push(tx)
    }
    for (const blueprint of this.state.activityBlueprints ?? []) {
      for (let i = 0; i < blueprint.versions.length; i++) {
        const version = blueprint.versions[i]
        const next = blueprint.versions[i + 1]?.effectiveFrom
        const end = [next, blueprint.stoppedOn].filter((date): date is string => !!date).sort()[0]
        const start = from > version.effectiveFrom ? from : version.effectiveFrom
        const until = end ? format(addDays(parseISO(end), -1), 'yyyy-MM-dd') : to
        const finish = to < until ? to : until
        if (start <= finish) {
          out.push(...this.expand(this.asTransaction(blueprint, version), start, finish)
            .filter((tx) => !overrides.has(tx.id) && !blueprint.skippedDates?.includes(tx.date)))
        }
      }
    }
    return out
  }

  private asTransaction(blueprint: ActivityBlueprint, version: ActivityBlueprintVersion): Transaction {
    return { ...version, id: blueprint.id, blueprintId: blueprint.id, createdAt: blueprint.createdAt }
  }

  private static version(tx: Transaction, effectiveFrom: string): ActivityBlueprintVersion {
    return {
      kind: tx.kind, boxId: tx.boxId, toBoxId: tx.toBoxId,
      amount: tx.amount, currency: tx.currency, category: tx.category,
      note: tx.note, date: tx.date, recurrence: tx.recurrence!, effectiveFrom,
    }
  }

  private expand(tx: Transaction, from: string, to: string): Transaction[] {
    return recurrenceAmountsBetween(tx.recurrence!, tx.amount, from, to).map(({ date, amount }) => ({
      ...tx, id: `${tx.id}:${date}`, blueprintId: tx.blueprintId ?? tx.id, date, amount, recurrence: undefined,
    }))
  }
}
