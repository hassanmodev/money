import { describe, expect, it } from 'vitest'
import { AcceptanceCurve, FlowNetwork, RoutingTable } from '../flow'
import type { Box, Forward, Settings } from '../types'

const settings: Settings = { baseCurrency: 'EUR', rates: { USD: 0.9 } }

let n = 0
const box = (b: Partial<Box>): Box => ({
  id: `b${n++}`,
  name: 'Box',
  kind: 'cash',
  currency: 'EUR',
  openingBalance: 0,
  openingDate: '2026-01-01',
  color: '#d4845c',
  effects: [],
  createdAt: '2026-01-01T00:00:00Z',
  ...b,
})

const fwd = (toBoxId: string, share: number): Forward => ({ id: `f-${toBoxId}`, toBoxId, share })

describe('AcceptanceCurve', () => {
  it('keeps everything by default', () => {
    const c = AcceptanceCurve.keepAll()
    expect(c.keepsEverything).toBe(true)
    const r = c.absorb(0, 100)
    expect(r).toMatchObject({ accepted: 100, overflow: 0, level: 100 })
  })

  it('tapers once the level crosses a threshold', () => {
    // keep 100% up to 10k, then 50% of the rest
    const c = new AcceptanceCurve([{ level: 10_000, rate: 0.5 }])
    const r = c.absorb(0, 30_000)
    // first 10k fully kept; next 20k offered kept at 50% → +10k
    expect(r.accepted).toBeCloseTo(20_000, 6)
    expect(r.overflow).toBeCloseTo(10_000, 6)
    expect(r.level).toBeCloseTo(20_000, 6)
  })

  it('uses the marginal rate of wherever the level already sits', () => {
    const c = new AcceptanceCurve([{ level: 10_000, rate: 0.5 }])
    const r = c.absorb(10_000, 1_000)
    expect(r.accepted).toBeCloseTo(500, 6)
    expect(r.overflow).toBeCloseTo(500, 6)
  })

  it('a zero rate refuses everything (a pure pass-through)', () => {
    const c = new AcceptanceCurve([{ level: 0, rate: 0 }])
    const r = c.absorb(0, 100)
    expect(r).toMatchObject({ accepted: 0, overflow: 100, level: 0 })
    expect(c.keepsEverything).toBe(false)
  })

  it('walks several tiers and always conserves the offer', () => {
    const c = new AcceptanceCurve([
      { level: 100, rate: 0.5 },
      { level: 200, rate: 0 },
    ])
    expect(c.rateAt(50)).toBe(1)
    expect(c.rateAt(150)).toBe(0.5)
    expect(c.rateAt(250)).toBe(0)
    const r = c.absorb(0, 1_000)
    expect(r.accepted).toBeCloseTo(200, 6) // 100 @100% + 100 of level @50%
    expect(r.overflow).toBeCloseTo(800, 6)
    expect(r.accepted + r.overflow).toBeCloseTo(1_000, 6)
  })

  it('clamps rates and ignores junk points', () => {
    const c = new AcceptanceCurve([
      { level: -5, rate: 2 },
      { level: 100, rate: -1 },
      { level: NaN, rate: 0.5 },
    ])
    expect(c.rateAt(0)).toBe(1) // level -5 → treated as the base, rate clamped to 1
    expect(c.rateAt(150)).toBe(0) // rate clamped to 0
  })
})

describe('RoutingTable', () => {
  it('keeps the whole overflow when empty', () => {
    const t = new RoutingTable()
    expect(t.split(100)).toMatchObject({ pushes: [], kept: 100 })
  })

  it('splits by absolute share, keeping the unrouted remainder', () => {
    const t = new RoutingTable([fwd('a', 0.3), fwd('b', 0.2)])
    const { pushes, kept } = t.split(100)
    expect(pushes).toEqual([
      { toBoxId: 'a', amount: 30 },
      { toBoxId: 'b', amount: 20 },
    ])
    expect(kept).toBeCloseTo(50, 6)
  })

  it('scales back over-allocation past 100% rather than inventing money', () => {
    const t = new RoutingTable([fwd('a', 0.8), fwd('b', 0.6)])
    expect(t.totalShare).toBe(1)
    const { pushes, kept } = t.split(100)
    expect(pushes[0].amount + pushes[1].amount).toBeCloseTo(100, 6)
    expect(kept).toBeCloseTo(0, 6)
  })
})

describe('FlowNetwork', () => {
  it('cascades overflow downstream, keeping each box its cut', () => {
    const a = box({ acceptance: [{ level: 100, rate: 0 }], forwards: [fwd('dst', 1)] })
    const dst = box({ id: 'dst' })
    const net = new FlowNetwork([a, dst], settings)
    net.deposit(a.id, 250)
    expect(net.balance(a.id)).toBeCloseTo(100, 6) // fills to its cap
    expect(net.balance('dst')).toBeCloseTo(150, 6) // the rest spills on
  })

  it('converts currency at each hop', () => {
    const a = box({ currency: 'EUR', acceptance: [{ level: 0, rate: 0 }], forwards: [fwd('dst', 1)] })
    const dst = box({ id: 'dst', currency: 'USD' })
    const net = new FlowNetwork([a, dst], settings)
    net.deposit(a.id, 90) // 90 EUR
    expect(net.balance('dst')).toBeCloseTo(100, 6) // = 90 EUR at rate 0.9
  })

  it('splits overflow across several targets', () => {
    const a = box({ acceptance: [{ level: 0, rate: 0 }], forwards: [fwd('x', 0.25), fwd('y', 0.75)] })
    const x = box({ id: 'x' })
    const y = box({ id: 'y' })
    const net = new FlowNetwork([a, x, y], settings)
    net.deposit(a.id, 400)
    expect(net.balance('x')).toBeCloseTo(100, 6)
    expect(net.balance('y')).toBeCloseTo(300, 6)
    expect(net.balance(a.id)).toBeCloseTo(0, 6)
  })

  it('keeps a deposit that is smaller than the source debt', () => {
    const a = box({ acceptance: [{ level: 0, rate: 0 }], forwards: [fwd('dst', 1)] })
    const dst = box({ id: 'dst' })
    const net = new FlowNetwork([a, dst], settings)
    net.withdraw(a.id, 100)
    net.deposit(a.id, 40)
    expect(net.balance(a.id)).toBeCloseTo(-60, 6)
    expect(net.balance('dst')).toBeCloseTo(0, 6)
  })

  it('forwards only the surplus after clearing source debt', () => {
    const a = box({ acceptance: [{ level: 0, rate: 0 }], forwards: [fwd('dst', 1)] })
    const dst = box({ id: 'dst' })
    const net = new FlowNetwork([a, dst], settings)
    net.withdraw(a.id, 100)
    net.deposit(a.id, 140)
    expect(net.balance(a.id)).toBeCloseTo(0, 6)
    expect(net.balance('dst')).toBeCloseTo(40, 6)
  })

  it('ignores forwards to boxes that are not in the network', () => {
    const a = box({ acceptance: [{ level: 0, rate: 0 }], forwards: [fwd('ghost', 1)] })
    const net = new FlowNetwork([a], settings)
    net.deposit(a.id, 100)
    // nowhere valid to send it → the box keeps it after all (money is conserved)
    expect(net.balance(a.id)).toBeCloseTo(100, 6)
  })

  it('terminates on a forward cycle without losing money', () => {
    const a = box({ id: 'a', acceptance: [{ level: 0, rate: 0 }], forwards: [fwd('b', 1)] })
    const b = box({ id: 'b', acceptance: [{ level: 0, rate: 0 }], forwards: [fwd('a', 1)] })
    const net = new FlowNetwork([a, b], settings)
    net.deposit('a', 100)
    expect(net.balance('a') + net.balance('b')).toBeCloseTo(100, 6)
  })
})
