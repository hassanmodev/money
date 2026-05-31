import {
  addMonths,
  addYears,
  differenceInCalendarDays,
  format,
  isThisYear,
  isToday,
  isYesterday,
  parseISO,
} from 'date-fns'
import type { ISODate } from '@/domain'

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

export const todayISO = (): ISODate => format(new Date(), 'yyyy-MM-dd')

export const toISO = (d: Date): ISODate => format(d, 'yyyy-MM-dd')

export const fmtDate = (iso: ISODate, fmt = 'MMM d, yyyy'): string =>
  format(parseISO(iso), fmt)

export const fmtDateShort = (iso: ISODate): string => format(parseISO(iso), 'MMM d')

export const fmtMonthYear = (iso: ISODate): string => format(parseISO(iso), 'MMM yyyy')

export const addMonthsISO = (iso: ISODate, months: number): ISODate =>
  toISO(addMonths(parseISO(iso), months))

export const addYearsISO = (iso: ISODate, years: number): ISODate =>
  toISO(addYears(parseISO(iso), years))

/** Fractional years between two ISO dates (signed). */
export const yearsBetween = (from: ISODate, to: ISODate): number =>
  (parseISO(to).getTime() - parseISO(from).getTime()) / MS_PER_YEAR

export const daysBetween = (from: ISODate, to: ISODate): number =>
  differenceInCalendarDays(parseISO(to), parseISO(from))

/** "Today" · "Yesterday" · "May 24" · "Dec 3, 2025" for activity grouping. */
export function relativeDay(iso: ISODate): string {
  const d = parseISO(iso)
  if (isToday(d)) return 'Today'
  if (isYesterday(d)) return 'Yesterday'
  return format(d, isThisYear(d) ? 'EEEE, MMM d' : 'MMM d, yyyy')
}
