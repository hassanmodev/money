import { describe, expect, it } from 'vitest'
import { simulate, slotIndexFor, slotToDateMinute, valueAt } from '../simulation'
import { mkQuality, WEEK } from './fixtures'

const flat = (id: string, value: number, drift?: number) =>
  mkQuality({ id, baseline: [{ minute: 0, value }], drift })

describe('slotIndexFor / slotToDateMinute', () => {
  it('maps dates and minutes into the week and back', () => {
    expect(slotIndexFor(WEEK, '2026-01-05', 600)).toBe(60) // Mon 10:00
    expect(slotIndexFor(WEEK, '2026-01-11', 1430)).toBe(1007) // Sun 23:50
    expect(slotIndexFor(WEEK, '2026-01-04', 0)).toBe(-1) // outside
    expect(slotToDateMinute(WEEK, 60)).toEqual({ date: '2026-01-05', minute: 600 })
    expect(slotToDateMinute(WEEK, 1007)).toEqual({ date: '2026-01-11', minute: 1430 })
  })
})

describe('simulate — passive drift', () => {
  it('a flat baseline at full stays full all week', () => {
    const sim = simulate({ qualities: [flat('mental', 100)], blocks: [], weekStart: WEEK })
    expect(sim.steps).toHaveLength(1008)
    expect(valueAt(sim, 'mental', 0)).toBeCloseTo(100, 5)
    expect(valueAt(sim, 'mental', 500)).toBeCloseTo(100, 5)
    expect(valueAt(sim, 'mental', 1007)).toBeCloseTo(100, 5)
  })

  it('follows a declining baseline even with no blocks — 9am ≠ 11pm', () => {
    const mental = mkQuality({
      id: 'mental',
      drift: 1,
      baseline: [
        { minute: 0, value: 100 },
        { minute: 720, value: 20 },
      ],
    })
    const sim = simulate({ qualities: [mental], blocks: [], weekStart: WEEK })
    expect(valueAt(sim, 'mental', 6)).toBeGreaterThan(90) // ~1am, still fresh
    expect(valueAt(sim, 'mental', 72)).toBeLessThan(40) // noon, worn down
  })
})

describe('simulate — block effects', () => {
  it('drains during a block and recovers after', () => {
    const sim = simulate({
      qualities: [flat('mental', 100)],
      blocks: [{ date: '2026-01-05', startMin: 600, durationMin: 120, effects: [{ quality: 'mental', open: -3, rate: -10 }] }],
      weekStart: WEEK,
    })
    const before = valueAt(sim, 'mental', 59)
    const during = valueAt(sim, 'mental', 66)
    const after = valueAt(sim, 'mental', 60 + 12 + 36) // 6h past the block
    expect(during).toBeLessThan(before - 5)
    expect(after).toBeGreaterThan(during)
  })

  it('applies the opening cost once, at the start', () => {
    const sim = simulate({
      qualities: [flat('mental', 100, 0)], // no drift: pure effect math
      blocks: [{ date: '2026-01-05', startMin: 600, durationMin: 30, effects: [{ quality: 'mental', open: -20, rate: 0 }] }],
      weekStart: WEEK,
    })
    expect(valueAt(sim, 'mental', 59)).toBeCloseTo(100, 5)
    expect(valueAt(sim, 'mental', 61)).toBeCloseTo(80, 5)
    expect(valueAt(sim, 'mental', 80)).toBeCloseTo(80, 5) // never re-applied
  })

  it('clamps at zero — never negative', () => {
    const sim = simulate({
      qualities: [flat('mental', 100, 0)],
      blocks: [{ date: '2026-01-05', startMin: 600, durationMin: 600, effects: [{ quality: 'mental', open: 0, rate: -1000 }] }],
      weekStart: WEEK,
    })
    for (const s of [65, 70, 100]) expect(valueAt(sim, 'mental', s)).toBeGreaterThanOrEqual(0)
  })

  it('gives lift a quality above its baseline', () => {
    const input = {
      qualities: [flat('physical', 20)],
      weekStart: WEEK,
    }
    const plain = simulate({ ...input, blocks: [] })
    const withSleep = simulate({
      ...input,
      blocks: [{ date: '2026-01-05', startMin: 0, durationMin: 480, effects: [{ quality: 'physical', open: 0, rate: 15 }] }],
    })
    expect(valueAt(withSleep, 'physical', 47)).toBeGreaterThan(valueAt(plain, 'physical', 47) + 5)
  })
})

describe('simulate — dependencies', () => {
  it('scales the dependent quality once the watched one drops below its threshold', () => {
    const physical = flat('physical', 20) // settles low within hours
    const mental = mkQuality({
      id: 'mental',
      baseline: [{ minute: 0, value: 100 }],
      dependsOn: [{ on: 'physical', below: 30, scale: 0.5 }],
    })
    const sim = simulate({ qualities: [physical, mental], blocks: [], weekStart: WEEK })
    expect(valueAt(sim, 'mental', 2)).toBeCloseTo(100, 0) // physical still high early
    expect(valueAt(sim, 'mental', 72)).toBeCloseTo(50, -1) // physical low → mental −50%
  })
})

describe('simulate — concurrent fragments', () => {
  it('the fragment drains its own qualities and degrades the host block’s gives', () => {
    const qualities = [flat('physical', 20), flat('mental', 100)]
    const host = {
      date: '2026-01-05',
      startMin: 600,
      durationMin: 120,
      effects: [{ quality: 'physical', open: 0, rate: 20 }],
    }
    const plain = simulate({ qualities, blocks: [host], weekStart: WEEK })
    const withFragment = simulate({
      qualities,
      blocks: [host],
      fragments: [{ at: '2026-01-05T10:30:00', minutes: 30, effects: [{ quality: 'mental', open: 0, rate: -10 }] }],
      weekStart: WEEK,
    })
    // during the overlap (slot 64 = 10:40): host gives count for less
    expect(valueAt(withFragment, 'physical', 64)).toBeLessThan(valueAt(plain, 'physical', 64))
    // and the fragment pays its own toll
    expect(valueAt(withFragment, 'mental', 64)).toBeLessThan(valueAt(plain, 'mental', 64) - 2)
  })
})
