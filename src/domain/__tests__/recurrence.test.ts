import { describe, expect, it } from 'vitest'
import {
  cadenceLabel,
  describeRecurrence,
  nextOccurrences,
  occurrencesBetween,
  recurrenceAmountsBetween,
} from '../recurrence'
import type { Recurrence } from '../types'

const rec = (r: Partial<Recurrence>): Recurrence => ({
  every: 1,
  unit: 'month',
  anchor: '2026-01-15',
  end: { type: 'never' },
  ...r,
})

describe('occurrencesBetween', () => {
  it('returns to the original day after a shorter month or leap year', () => {
    const monthly = rec({ anchor: '2026-01-31' })
    expect(occurrencesBetween(monthly, '2026-01-01', '2026-04-30')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ])
    expect(nextOccurrences(monthly, 4, '2026-01-01')).toEqual([
      '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    ])
    expect(occurrencesBetween(rec({ anchor: '2024-02-29', unit: 'year' }), '2024-01-01', '2028-12-31').at(-1)).toBe('2028-02-29')
  })
  it('expands a monthly recurrence within a window', () => {
    const out = occurrencesBetween(rec({}), '2026-01-01', '2026-04-30')
    expect(out).toEqual(['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15'])
  })

  it('honours the every-N interval', () => {
    const out = occurrencesBetween(
      rec({ every: 2, unit: 'week', anchor: '2026-01-01' }),
      '2026-01-01',
      '2026-02-15',
    )
    expect(out).toEqual(['2026-01-01', '2026-01-15', '2026-01-29', '2026-02-12'])
  })

  it('stops after N occurrences', () => {
    const out = occurrencesBetween(
      rec({ end: { type: 'after', count: 3 } }),
      '2026-01-01',
      '2027-01-01',
    )
    expect(out).toHaveLength(3)
    expect(out.at(-1)).toBe('2026-03-15')
  })

  it('stops on the end date (inclusive)', () => {
    const out = occurrencesBetween(
      rec({ end: { type: 'on', date: '2026-03-15' } }),
      '2026-01-01',
      '2027-01-01',
    )
    expect(out).toEqual(['2026-01-15', '2026-02-15', '2026-03-15'])
  })

  it('clips to the requested window', () => {
    const out = occurrencesBetween(rec({}), '2026-03-01', '2026-05-01')
    expect(out).toEqual(['2026-03-15', '2026-04-15'])
  })
})

describe('nextOccurrences', () => {
  it('returns the next n dates on or after a point', () => {
    const out = nextOccurrences(rec({}), 3, '2026-02-20')
    expect(out).toEqual(['2026-03-15', '2026-04-15', '2026-05-15'])
  })
})

describe('recurrenceAmountsBetween', () => {
  it('spreads a weekly amount evenly across each day', () => {
    const out = recurrenceAmountsBetween(
      rec({ unit: 'week', anchor: '2026-01-01', dailyAccrual: true }),
      70,
      '2026-01-01',
      '2026-01-07',
    )
    expect(out).toHaveLength(7)
    expect(out.every((entry) => entry.amount === 10)).toBe(true)
  })

  it('uses the actual number of calendar days in a monthly period', () => {
    const out = recurrenceAmountsBetween(
      rec({ anchor: '2026-02-01', dailyAccrual: true }),
      280,
      '2026-02-01',
      '2026-02-28',
    )
    expect(out).toHaveLength(28)
    expect(out.reduce((sum, entry) => sum + entry.amount, 0)).toBeCloseTo(280, 10)
  })

  it('preserves lump-sum occurrences when daily accrual is off', () => {
    const out = recurrenceAmountsBetween(rec({}), 100, '2026-01-01', '2026-03-31')
    expect(out).toEqual([
      { date: '2026-01-15', amount: 100 },
      { date: '2026-02-15', amount: 100 },
      { date: '2026-03-15', amount: 100 },
    ])
  })
})

describe('labels', () => {
  it('uses adverbs for every-1 cadences', () => {
    expect(cadenceLabel(rec({ every: 1, unit: 'week' }))).toBe('Weekly')
    expect(cadenceLabel(rec({ every: 1, unit: 'day' }))).toBe('Daily')
  })

  it('counts for every-N cadences', () => {
    expect(cadenceLabel(rec({ every: 3, unit: 'month' }))).toBe('Every 3 months')
  })

  it('describes the end condition', () => {
    expect(describeRecurrence(rec({ end: { type: 'after', count: 6 } }))).toBe(
      'Monthly, 6×',
    )
  })
})
