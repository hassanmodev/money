import { describe, expect, it } from 'vitest'
import {
  cadenceLabel,
  describeRecurrence,
  nextOccurrences,
  occurrencesBetween,
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
