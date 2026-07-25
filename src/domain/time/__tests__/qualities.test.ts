import { describe, expect, it } from 'vitest'
import { applyDependencies, baselineAt, topoOrder, wouldCreateCycle } from '../qualities'
import { mkQuality } from './fixtures'

describe('baselineAt', () => {
  it('returns the constant with a single point', () => {
    expect(baselineAt(mkQuality({ id: 'q', baseline: [{ minute: 300, value: 42 }] }), 800)).toBe(42)
  })

  it('interpolates between points', () => {
    const q = mkQuality({
      id: 'q',
      baseline: [
        { minute: 0, value: 100 },
        { minute: 720, value: 20 },
      ],
    })
    expect(baselineAt(q, 360)).toBeCloseTo(60, 5)
  })

  it('wraps across midnight', () => {
    const q = mkQuality({
      id: 'q',
      baseline: [
        { minute: 600, value: 100 },
        { minute: 1320, value: 20 },
      ],
    })
    // 4:00 sits halfway through the 22:00 → 10:00 wrap segment
    expect(baselineAt(q, 240)).toBeCloseTo(60, 5)
  })
})

describe('wouldCreateCycle', () => {
  const physical = mkQuality({ id: 'physical' })
  const mental = mkQuality({
    id: 'mental',
    dependsOn: [{ on: 'physical', below: 30, scale: 0.6 }],
  })

  it('rejects direct and indirect cycles', () => {
    expect(wouldCreateCycle([physical, mental], 'physical', { on: 'mental', below: 10, scale: 1 })).toBe(true)
    expect(wouldCreateCycle([physical, mental], 'physical', { on: 'physical', below: 10, scale: 1 })).toBe(true)
  })

  it('accepts acyclic additions', () => {
    const focus = mkQuality({ id: 'focus' })
    expect(wouldCreateCycle([physical, mental, focus], 'focus', { on: 'mental', below: 10, scale: 1 })).toBe(false)
  })
})

describe('topoOrder + applyDependencies', () => {
  it('applies dependencies after the qualities they watch', () => {
    const physical = mkQuality({ id: 'physical', max: 100 })
    const mental = mkQuality({
      id: 'mental',
      max: 100,
      dependsOn: [{ on: 'physical', below: 30, scale: 0.5 }],
    })
    const order = topoOrder([mental, physical])
    expect(order.indexOf('physical')).toBeLessThan(order.indexOf('mental'))

    const out = applyDependencies([mental, physical], order, { physical: 20, mental: 80 })
    expect(out.mental).toBe(40) // physical < 30 → mental halved
    expect(out.physical).toBe(20)
  })

  it('chains through qualities referencing qualities', () => {
    const a = mkQuality({ id: 'a' })
    const b = mkQuality({ id: 'b', dependsOn: [{ on: 'a', below: 50, scale: 0.5 }] })
    const c = mkQuality({ id: 'c', dependsOn: [{ on: 'b', below: 30, scale: 0.5 }] })
    const order = topoOrder([c, b, a])
    const out = applyDependencies([c, b, a], order, { a: 40, b: 80, c: 90 })
    expect(out.b).toBe(40) // a < 50
    expect(out.c).toBe(90) // effective b (40) is not < 30
  })
})
