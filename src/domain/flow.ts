/**
 * Money routing between boxes — the "waterfall".
 *
 * Two ideas compose here:
 *
 *  1. An **acceptance curve**. A box decides how much of an incoming amount it
 *     keeps as a function of how full it already is. Picture a tank with tiers:
 *     it fills greedily while low, then tapers once it crosses a threshold —
 *     "keep everything up to €10k, then only half of what comes after". The
 *     part a box declines is its *overflow*.
 *
 *  2. **Forwards**. A box routes its overflow on to other boxes, each taking a
 *     share. Forwarding cascades: a target runs its own curve, keeps its cut,
 *     and forwards what *it* declines — so money trickles down a chain of boxes
 *     until everyone has taken what they want.
 *
 * Money is never created or destroyed. Whatever a box can neither keep nor
 * forward (no targets, or shares that don't add up to 100%) simply stays put.
 *
 * The classes below are the behavioural, OOP face of the plain `AcceptancePoint`
 * / `Forward` records that live on a `Box`. They're constructed from that data,
 * never persisted — hydrate, compute, discard. Pure and framework-free, like
 * the rest of `src/domain`.
 */
import { parseISO } from 'date-fns'
import { nominalFactor } from './effects'
import { convert } from './money'
import type { AcceptancePoint, Box, Forward, Settings } from './types'

/** Below this, an amount of money is treated as nothing (kills tiny cascades). */
const EPSILON = 1e-9
/** Hard ceiling on cascade hops — a backstop against pathological forward cycles. */
const MAX_HOPS = 10_000
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000

/** A box currently at `level` keeps `accepted`; `overflow` is up for forwarding. */
export interface Absorption {
  accepted: number
  overflow: number
  /** the box's new level after taking its cut */
  level: number
}

/** Where overflow lands: amounts pushed onward, plus what couldn't be routed. */
export interface Split {
  pushes: { toBoxId: string; amount: number }[]
  /** the unroutable remainder (shares summing to < 100%) — stays in the box */
  kept: number
}

interface Segment {
  /** level (box currency) from which `rate` applies, ascending; first is 0 */
  from: number
  /** fraction of further inflow kept across this tier, 0..1 */
  rate: number
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n)

/**
 * A box's tiered take-rate, as a function of how full it is.
 *
 * Built from the raw points, it exposes the marginal rate at any level and —
 * the useful bit — integrates that rate across an incoming amount, since the
 * level (and therefore the rate) rises as the box fills mid-deposit.
 */
export class AcceptanceCurve {
  private readonly segments: Segment[]

  constructor(points: readonly AcceptancePoint[] = []) {
    const clean = points
      .filter((p) => Number.isFinite(p.level) && Number.isFinite(p.rate) && p.level >= 0)
      .map((p) => ({ level: p.level, rate: clamp01(p.rate) }))
      .sort((a, b) => a.level - b.level)

    const segments: Segment[] = [{ from: 0, rate: 1 }]
    for (const p of clean) {
      if (p.level <= 0) segments[0].rate = p.rate
      else if (segments[segments.length - 1].from === p.level)
        segments[segments.length - 1].rate = p.rate // later point at same level wins
      else segments.push({ from: p.level, rate: p.rate })
    }
    this.segments = segments
  }

  /** A curve that keeps everything it's offered — the default for a plain box. */
  static keepAll(): AcceptanceCurve {
    return new AcceptanceCurve()
  }

  /** True when the box keeps 100% everywhere, so routing can shortcut it. */
  get keepsEverything(): boolean {
    return this.segments.every((s) => s.rate >= 1)
  }

  private segmentAt(level: number): number {
    let i = 0
    while (i + 1 < this.segments.length && this.segments[i + 1].from <= level) i++
    return i
  }

  /** Marginal keep-rate at a given level (the slope of the fill curve there). */
  rateAt(level: number): number {
    return this.segments[this.segmentAt(level)].rate
  }

  /**
   * Pour `amount` onto a box sitting at `level`. Walks the tiers, keeping each
   * slice at that tier's rate until the offered amount runs out. The declined
   * fraction (`amount − accepted`) is the overflow.
   */
  absorb(level: number, amount: number): Absorption {
    if (amount <= 0) return { accepted: amount, overflow: 0, level: level + amount }

    let lvl = level
    let remaining = amount
    let accepted = 0
    let si = this.segmentAt(lvl)

    while (remaining > EPSILON) {
      const { rate } = this.segments[si]
      // A zero-rate tier can't fill, so the box never climbs past it: the rest
      // of the offer is declined wholesale.
      if (rate <= 0) break

      const next = si + 1 < this.segments.length ? this.segments[si + 1].from : Infinity
      const room = next - lvl // headroom (in level) before the rate changes

      if (!Number.isFinite(room)) {
        accepted += remaining * rate
        lvl += remaining * rate
        break
      }

      const offerToFill = room / rate // offered units needed to climb `room`
      if (offerToFill <= remaining) {
        accepted += room // level rises by exactly `room`
        lvl = next
        remaining -= offerToFill
        si++
      } else {
        accepted += remaining * rate
        lvl += remaining * rate
        remaining = 0
      }
    }

    return { accepted, overflow: amount - accepted, level: lvl }
  }
}

/**
 * A box's overflow destinations. Shares are absolute fractions of the overflow
 * (forward 30% here, 20% there → 50% leaves, 50% stays). Over-allocation beyond
 * 100% is scaled back proportionally rather than conjuring money.
 */
export class RoutingTable {
  private readonly routes: { toBoxId: string; share: number }[]
  readonly totalShare: number

  constructor(forwards: readonly Forward[] = []) {
    this.routes = forwards
      .filter((f) => f.toBoxId && Number.isFinite(f.share) && f.share > 0)
      .map((f) => ({ toBoxId: f.toBoxId, share: f.share }))
    const sum = this.routes.reduce((s, r) => s + r.share, 0)
    this.totalShare = Math.min(1, sum)
    // Never route more than the whole overflow.
    if (sum > 1) for (const r of this.routes) r.share /= sum
  }

  get isEmpty(): boolean {
    return this.routes.length === 0
  }

  /** Divide `overflow` among the targets; the unrouted slice comes back as `kept`. */
  split(overflow: number): Split {
    if (overflow <= 0 || this.isEmpty) return { pushes: [], kept: Math.max(0, overflow) }
    const pushes = this.routes.map((r) => ({ toBoxId: r.toBoxId, amount: overflow * r.share }))
    const routed = pushes.reduce((s, p) => s + p.amount, 0)
    return { pushes, kept: overflow - routed }
  }
}

/**
 * A box wearing its routing behaviour: the raw box, its acceptance curve, and
 * its forward table. Stateless beyond what it's handed — the running balance
 * lives in the {@link FlowNetwork} that owns it.
 */
export class FlowNode {
  readonly box: Box
  readonly curve: AcceptanceCurve
  readonly routing: RoutingTable

  /** `forwards` must already be filtered to targets that actually exist. */
  constructor(box: Box, forwards: readonly Forward[]) {
    this.box = box
    this.curve = new AcceptanceCurve(box.acceptance)
    this.routing = new RoutingTable(forwards)
  }

  /** True when the box keeps everything and forwards nothing — a plain bucket. */
  get isPassive(): boolean {
    return this.curve.keepsEverything && this.routing.isEmpty
  }

  /**
   * Receive `amount` (this box's currency) at a given starting `level`. Returns
   * the box's new level and the amounts to push onward (still this box's
   * currency — the network converts at the boundary).
   */
  receive(level: number, amount: number): { level: number; pushes: Split['pushes'] } {
    const debtPayment = Math.min(amount, Math.max(0, -level))
    const { overflow, level: filled } = this.curve.absorb(
      level + debtPayment,
      amount - debtPayment,
    )
    const { pushes, kept } = this.routing.split(overflow)
    return { level: filled + kept, pushes }
  }
}

/**
 * The whole set of boxes wired together, plus the running balances and a clock.
 *
 * It doubles as the time-stepping engine the projection drives: advance the
 * clock, deposit/withdraw, and balances compound their effects in between.
 * Deposits cascade through the forward graph; everything else is a plain poke
 * at one balance.
 */
export class FlowNetwork {
  private readonly nodes = new Map<string, FlowNode>()
  private readonly level = new Map<string, number>()
  private readonly lastT = new Map<string, number>()
  private readonly settings: Settings
  private now = -Infinity

  constructor(boxes: readonly Box[], settings: Settings) {
    this.settings = settings
    const present = new Set(boxes.map((b) => b.id))
    for (const box of boxes) {
      const forwards = (box.forwards ?? []).filter(
        (f) => f.toBoxId !== box.id && present.has(f.toBoxId),
      )
      this.nodes.set(box.id, new FlowNode(box, forwards))
      this.level.set(box.id, 0)
      this.lastT.set(box.id, parseISO(box.openingDate).getTime())
    }
  }

  /** Move the simulation clock; subsequent reads compound up to here. */
  setClock(t: number): void {
    this.now = t
  }

  /** Lazily grow a balance by its effects from the last time it was touched. */
  private advance(id: string): void {
    const last = this.lastT.get(id)!
    if (this.now <= last) return
    const value = this.level.get(id)!
    if (value !== 0) {
      const node = this.nodes.get(id)!
      this.level.set(id, value * nominalFactor(node.box.effects, (this.now - last) / MS_PER_YEAR))
    }
    this.lastT.set(id, this.now)
  }

  /** Seed a box's opening balance (not subject to its own curve/forwards). */
  open(id: string): void {
    this.advance(id)
    this.level.set(id, this.level.get(id)! + this.nodes.get(id)!.box.openingBalance)
  }

  /** Take money out of a box (an expense or a transfer's source leg). */
  withdraw(id: string, amount: number): void {
    if (!this.nodes.has(id)) return
    this.advance(id)
    this.level.set(id, this.level.get(id)! - amount)
  }

  /**
   * Put money into a box and let it cascade through the forward graph. `amount`
   * is in the starting box's currency; each hop converts into the target's.
   */
  deposit(startId: string, amount: number): void {
    const queue: { id: string; amount: number }[] = [{ id: startId, amount }]
    let hops = 0

    while (queue.length) {
      const { id, amount: amt } = queue.shift()!
      if (amt <= EPSILON) continue
      const node = this.nodes.get(id)
      if (!node) continue
      this.advance(id)

      // Backstop: dust or a runaway cycle just settles where it stands.
      if (++hops > MAX_HOPS) {
        this.level.set(id, this.level.get(id)! + amt)
        continue
      }

      const { level, pushes } = node.receive(this.level.get(id)!, amt)
      this.level.set(id, level)
      for (const p of pushes) {
        const target = this.nodes.get(p.toBoxId)
        if (!target) continue
        queue.push({
          id: p.toBoxId,
          amount: convert(p.amount, node.box.currency, target.box.currency, this.settings),
        })
      }
    }
  }

  /** A box's balance right now, in its own currency. */
  balance(id: string): number {
    this.advance(id)
    return this.level.get(id) ?? 0
  }

  /** Every balance, compounded to now — for sampling a moment of the projection. */
  snapshot(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const id of this.nodes.keys()) out[id] = this.balance(id)
    return out
  }
}
