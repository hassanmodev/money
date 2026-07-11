/** Expanding recurrences into concrete dates, plus human-friendly labels. */
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  parseISO,
} from 'date-fns'
import type { ISODate, Recurrence, RecurrenceUnit } from './types'

const toISO = (d: Date): ISODate => format(d, 'yyyy-MM-dd')

function step(date: Date, every: number, unit: RecurrenceUnit): Date {
  switch (unit) {
    case 'day':
      return addDays(date, every)
    case 'week':
      return addWeeks(date, every)
    case 'month':
      return addMonths(date, every)
    case 'year':
      return addYears(date, every)
  }
}

const SAFETY_LIMIT = 200_000

export interface RecurrenceAmount {
  date: ISODate
  amount: number
}

/**
 * All occurrence dates of `rec` that fall within [from, to] inclusive.
 * Honours the recurrence's own end condition (never / on date / after N).
 */
export function occurrencesBetween(
  rec: Recurrence,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  const fromD = parseISO(from)
  const toD = parseISO(to)
  const hardEnd = rec.end.type === 'on' ? parseISO(rec.end.date) : null
  const maxCount = rec.end.type === 'after' ? rec.end.count : Infinity
  const every = Math.max(1, Math.floor(rec.every))

  const out: ISODate[] = []
  let d = parseISO(rec.anchor)

  for (let i = 0; i < SAFETY_LIMIT; i++) {
    if (i >= maxCount) break
    if (isAfter(d, toD)) break
    if (hardEnd && isAfter(d, hardEnd)) break
    if (!isBefore(d, fromD)) out.push(toISO(d)) // d >= from
    d = step(d, every, rec.unit)
  }
  return out
}

/**
 * Dated amounts for a recurrence within [from, to]. Normally each occurrence
 * carries the full amount. With daily accrual, each recurrence period is split
 * evenly across its actual calendar days, preserving the entered amount over a
 * complete period (including variable-length months and leap years).
 */
export function recurrenceAmountsBetween(
  rec: Recurrence,
  amount: number,
  from: ISODate,
  to: ISODate,
): RecurrenceAmount[] {
  if (!rec.dailyAccrual || rec.unit === 'day') {
    return occurrencesBetween(rec, from, to).map((date) => ({ date, amount }))
  }

  const fromD = parseISO(from)
  const toD = parseISO(to)
  const hardEnd = rec.end.type === 'on' ? parseISO(rec.end.date) : null
  const maxCount = rec.end.type === 'after' ? rec.end.count : Infinity
  const every = Math.max(1, Math.floor(rec.every))
  const out: RecurrenceAmount[] = []
  let periodStart = parseISO(rec.anchor)

  for (let i = 0; i < SAFETY_LIMIT; i++) {
    if (i >= maxCount) break
    if (isAfter(periodStart, toD)) break
    if (hardEnd && isAfter(periodStart, hardEnd)) break

    const periodEnd = step(periodStart, every, rec.unit)
    const days = Math.max(1, differenceInCalendarDays(periodEnd, periodStart))
    const dailyAmount = amount / days
    let day = periodStart

    for (let j = 0; j < days; j++) {
      if (isAfter(day, toD)) break
      if (hardEnd && isAfter(day, hardEnd)) break
      if (!isBefore(day, fromD)) out.push({ date: toISO(day), amount: dailyAmount })
      day = addDays(day, 1)
    }

    periodStart = periodEnd
  }

  return out
}

/** The next `n` occurrences on or after `from` (default: today). */
export function nextOccurrences(
  rec: Recurrence,
  n: number,
  from: ISODate,
): ISODate[] {
  const fromD = parseISO(from)
  const hardEnd = rec.end.type === 'on' ? parseISO(rec.end.date) : null
  const maxCount = rec.end.type === 'after' ? rec.end.count : Infinity
  const every = Math.max(1, Math.floor(rec.every))

  const out: ISODate[] = []
  let d = parseISO(rec.anchor)

  for (let i = 0; i < SAFETY_LIMIT && out.length < n; i++) {
    if (i >= maxCount) break
    if (hardEnd && isAfter(d, hardEnd)) break
    if (!isBefore(d, fromD)) out.push(toISO(d))
    d = step(d, every, rec.unit)
  }
  return out
}

const UNIT_NOUN: Record<RecurrenceUnit, string> = {
  day: 'day',
  week: 'week',
  month: 'month',
  year: 'year',
}

const UNIT_ADVERB: Record<RecurrenceUnit, string> = {
  day: 'Daily',
  week: 'Weekly',
  month: 'Monthly',
  year: 'Yearly',
}

/** "Daily" · "Every 2 weeks" · "Monthly" — the cadence in plain words. */
export function cadenceLabel(rec: Recurrence): string {
  const every = Math.max(1, Math.floor(rec.every))
  if (every === 1) return UNIT_ADVERB[rec.unit]
  return `Every ${every} ${UNIT_NOUN[rec.unit]}s`
}

/** A full sentence including the end condition. */
export function describeRecurrence(rec: Recurrence): string {
  const base = cadenceLabel(rec)
  switch (rec.end.type) {
    case 'never':
      return base
    case 'on':
      return `${base} until ${format(parseISO(rec.end.date), 'MMM d, yyyy')}`
    case 'after':
      return `${base}, ${rec.end.count}×`
  }
}

/** Approximate number of occurrences per year — handy for burn-rate maths. */
export function occurrencesPerYear(rec: Recurrence): number {
  const perYear: Record<RecurrenceUnit, number> = {
    day: 365.25,
    week: 52.1786,
    month: 12,
    year: 1,
  }
  return perYear[rec.unit] / Math.max(1, rec.every)
}
