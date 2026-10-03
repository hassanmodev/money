import { differenceInCalendarDays, format, parseISO, subYears } from 'date-fns'
import { toBase } from '@/domain/money'
import { occurrencesBetween, recurrenceAmountsBetween } from '@/domain/recurrence'
import type { PlannedBuy } from '@/domain/projection'
import type { FinanceState, Transaction } from '@/domain/types'

export class ActivityStatsModel {
  income = 0
  spending = 0
  excluded = 0
  readonly threshold: number | null
  readonly excludedPurchases: ActivityStatsModel['purchases']
  readonly days: number
  readonly entries: {
    id: string; label: string; date: string; lastDate: string; amount: number
    kind: Transaction['kind']; cadence: string; count: number; excluded: boolean
  }[] = []

  constructor(state: FinanceState, from: string, to: string, multiplier = Infinity, planned: PlannedBuy[] = []) {
    this.days = differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
    const historyStart = format(subYears(parseISO(to), 1), 'yyyy-MM-dd')
    const history: number[] = []
    // Use a year of entry sizes so a short date range doesn't redefine "usual".
    for (const tx of state.transactions) {
      if (tx.kind !== 'expense' || tx.amount <= 0) continue
      const inHistory = tx.recurrence
        ? occurrencesBetween(tx.recurrence, historyStart, to).length > 0
        : tx.date >= historyStart && tx.date <= to
      if (inHistory) history.push(toBase(tx.amount, tx.currency, state.settings))
    }
    history.sort((a, b) => a - b)
    const middle = Math.floor(history.length / 2)
    const median = history.length % 2 ? history[middle] : (history[middle - 1] + history[middle]) / 2
    this.threshold = history.length >= 3 ? median * multiplier : null
    for (const tx of state.transactions) {
      if (tx.kind === 'transfer') continue
      const amounts = tx.recurrence
        ? recurrenceAmountsBetween(tx.recurrence, tx.amount, from, to)
        : tx.date >= from && tx.date <= to ? [{ date: tx.date, amount: tx.amount }] : []
      if (!amounts.length) continue
      const amount = amounts.reduce((sum, entry) => sum + toBase(entry.amount, tx.currency, state.settings), 0)
      this.entries.push({
        id: `tx:${tx.id}`, label: tx.note || tx.category || (tx.kind === 'income' ? 'Income' : 'Purchase'),
        date: amounts[0].date, lastDate: amounts[amounts.length - 1].date, amount, kind: tx.kind,
        cadence: tx.recurrence?.dailyAccrual ? 'Daily accrual' : tx.recurrence ? 'Recurring' : 'One-off',
        count: amounts.length, excluded: !tx.recurrence && tx.kind === 'expense' && this.isUnusual(amount),
      })
    }
    for (const goal of state.goals) {
      if (goal.status !== 'done' || !goal.doneDate || goal.doneDate < from || goal.doneDate > to) continue
      this.addPurchase(`goal:${goal.id}`, goal.name, goal.doneDate, goal.cost)
    }
    for (const buy of planned) {
      if (buy.date < from || buy.date > to) continue
      this.addPurchase(`buy:${buy.id}:${buy.date}`, buy.label, buy.date, buy.cost)
    }
    this.entries.sort((a, b) => b.amount - a.amount)
    this.excludedPurchases = this.entries.filter((entry) => entry.excluded)
    for (const entry of this.entries) {
      if (entry.kind === 'income') this.income += entry.amount
      else this.spending += entry.amount
      if (entry.excluded) this.excluded += entry.amount
    }
  }

  private addPurchase(id: string, label: string, date: string, amount: number) {
    this.entries.push({ id, label, date, lastDate: date, amount, kind: 'expense', cadence: 'Goal purchase', count: 1, excluded: this.isUnusual(amount) })
  }

  private isUnusual(amount: number) { return this.threshold !== null && amount > this.threshold }

  get purchases() { return this.entries.filter((entry) => entry.kind === 'expense' && (entry.cadence === 'One-off' || entry.cadence === 'Goal purchase')) }

  get adjustedSpending() { return this.spending - this.excluded }
  get left() { return this.income - this.adjustedSpending }
  get savingsRate() { return this.income > 0 ? this.left / this.income * 100 : null }
  average(amount: number, days: number) { return amount / this.days * days }
}
