import { ArrowRight, Plus, Waves, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import {
  AcceptanceCurve,
  currencyMeta,
  type AcceptancePoint,
  type Box,
  type Forward,
} from '@/domain'
import { fmtCompact, fmtPercent } from '@/lib/format'
import { newId } from '@/lib/id'
import { hexToRgba } from '@/lib/palette'
import { Select, Slider } from '@/ui'
import { boxIcon } from '@/ui/icons'

const pctLabel = (rate: number) => `${Math.round(rate * 100)}%`

/**
 * A live picture of the acceptance curve: as money flows in (left → right), the
 * coloured band is what the box keeps; the faint band above is what spills over
 * to its forwards. The diagonal is the "keep everything" reference.
 */
function CurvePreview({
  points,
  color,
  currency,
}: {
  points: AcceptancePoint[]
  color: string
  currency: string
}) {
  const W = 320
  const H = 132
  const padX = 8
  const padT = 12
  const padB = 8

  const { keptPath, overflowPath, guides } = useMemo(() => {
    const curve = new AcceptanceCurve(points)
    const topLevel = points.reduce((m, p) => Math.max(m, p.level), 0)
    const maxIn = topLevel > 0 ? topLevel * 2.4 : 1000
    const N = 56
    const xs = Array.from({ length: N }, (_, i) => (maxIn * i) / (N - 1))
    const kept = xs.map((offered) => curve.absorb(0, offered).accepted)

    const sx = (v: number) => padX + (v / maxIn) * (W - padX * 2)
    const sy = (v: number) => H - padB - (v / maxIn) * (H - padT - padB)

    const keptLine = xs.map((x, i) => `${sx(x)},${sy(kept[i])}`).join(' L ')
    const keptPath = `M ${sx(0)},${sy(0)} L ${keptLine} L ${sx(maxIn)},${sy(0)} Z`
    // overflow sits between the kept curve and the diagonal (offered === value)
    const overflowTop = xs.map((x, i) => `${sx(x)},${sy(kept[i])}`).join(' L ')
    const diagBack = [...xs].reverse().map((x) => `${sx(x)},${sy(x)}`).join(' L ')
    const overflowPath = `M ${overflowTop} L ${diagBack} Z`

    const guides = points
      .filter((p) => p.level > 0 && p.level <= maxIn)
      .map((p) => ({ y: sy(p.level), level: p.level }))

    return { keptPath, overflowPath, guides }
  }, [points])

  const symbol = currencyMeta(currency).symbol

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[132px] w-full" preserveAspectRatio="none">
      {/* keep-everything reference */}
      <line x1={padX} y1={H - padB} x2={W - padX} y2={padT} stroke="var(--color-line-2)" strokeWidth={1} strokeDasharray="3 4" />
      {/* spilled-over band */}
      <path d={overflowPath} fill="var(--color-faint)" opacity={0.16} />
      {/* kept band */}
      <path d={keptPath} fill={hexToRgba(color, 0.32)} stroke={color} strokeWidth={1.5} />
      {/* threshold guides */}
      {guides.map((g, i) => (
        <g key={i}>
          <line x1={padX} y1={g.y} x2={W - padX} y2={g.y} stroke={color} strokeWidth={1} strokeDasharray="2 4" opacity={0.5} />
          <text x={W - padX} y={g.y - 3} textAnchor="end" fontSize={9} fill="var(--color-faint)" className="tabular">
            {symbol}
            {fmtCompact(g.level)}
          </text>
        </g>
      ))}
      <text x={padX} y={H - padB - 2} fontSize={9} fill="var(--color-ghost)">
        money in →
      </text>
    </svg>
  )
}

function TierRow({
  point,
  symbol,
  onChange,
  onRemove,
}: {
  point: AcceptancePoint
  symbol: string
  onChange: (patch: Partial<AcceptancePoint>) => void
  onRemove: () => void
}) {
  const levelStr = point.level ? String(point.level) : ''
  return (
    <div className="rounded-2xl border border-line bg-sunken/30 p-3.5">
      <div className="flex items-center gap-2 text-xs text-faint">
        <span>Once it holds</span>
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted">{symbol}</span>
          <input
            value={levelStr}
            onChange={(e) => {
              const n = parseFloat(e.target.value)
              onChange({ level: Number.isNaN(n) ? 0 : n })
            }}
            inputMode="decimal"
            placeholder="0"
            aria-label="Level threshold"
            className="w-full rounded-lg border border-line bg-sunken/40 py-1.5 pl-7 pr-2 text-right text-sm tabular text-ink outline-none focus:border-clay/50"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove tier"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-rust/10 hover:text-rust"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-faint">keep</span>
        <Slider
          aria-label="Keep rate"
          value={point.rate}
          onValueChange={(v) => onChange({ rate: Math.round(v * 20) / 20 })}
          min={0}
          max={1}
          step={0.05}
          className="flex-1"
        />
        <span className="w-10 text-right text-sm tabular text-ink">{pctLabel(point.rate)}</span>
      </div>
    </div>
  )
}

/** A box's glyph, or a generic fallback when no target is chosen yet. */
function TargetGlyph({ target }: { target?: Box }) {
  if (!target) return <Waves className="size-4" />
  const Icon = boxIcon(target)
  return <Icon className="size-4" />
}

function ForwardRow({
  forward,
  targets,
  onChange,
  onRemove,
}: {
  forward: Forward
  targets: Box[]
  onChange: (patch: Partial<Forward>) => void
  onRemove: () => void
}) {
  const options = targets.map((b) => ({ value: b.id, label: b.name }))
  const target = targets.find((b) => b.id === forward.toBoxId)

  return (
    <div className="rounded-2xl border border-line bg-sunken/30 p-3.5">
      <div className="flex items-center gap-2">
        <ArrowRight className="size-4 shrink-0 text-faint" />
        <div
          className="grid size-7 shrink-0 place-items-center rounded-lg"
          style={target ? { backgroundColor: hexToRgba(target.color, 0.16), color: target.color } : undefined}
        >
          <TargetGlyph target={target} />
        </div>
        <Select
          aria-label="Forward target"
          value={forward.toBoxId}
          onValueChange={(v) => onChange({ toBoxId: v })}
          options={options}
          placeholder="Choose a box"
          className="h-9 flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove forward"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-rust/10 hover:text-rust"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-faint">of overflow</span>
        <Slider
          aria-label="Forward share"
          value={forward.share}
          onValueChange={(v) => onChange({ share: Math.round(v * 20) / 20 })}
          min={0}
          max={1}
          step={0.05}
          className="flex-1"
        />
        <span className="w-10 text-right text-sm tabular text-ink">{pctLabel(forward.share)}</span>
      </div>
    </div>
  )
}

/**
 * Edits a box's "spillover" behaviour: a tiered acceptance curve (how much of
 * incoming money it keeps as it fills) and where the rest is forwarded.
 */
export function FlowEditor({
  acceptance,
  onAcceptanceChange,
  forwards,
  onForwardsChange,
  currency,
  color,
  targets,
}: {
  acceptance: AcceptancePoint[]
  onAcceptanceChange: (points: AcceptancePoint[]) => void
  forwards: Forward[]
  onForwardsChange: (forwards: Forward[]) => void
  currency: string
  /** the owning box's swatch, for the preview */
  color: string
  /** other boxes this one can forward to */
  targets: Box[]
}) {
  const symbol = currencyMeta(currency).symbol
  const keepsEverything = useMemo(
    () => new AcceptanceCurve(acceptance).keepsEverything,
    [acceptance],
  )
  const totalForwarded = Math.min(1, forwards.reduce((s, f) => s + (f.share || 0), 0))

  const addTier = () => {
    const top = acceptance.reduce((m, p) => Math.max(m, p.level), 0)
    onAcceptanceChange([...acceptance, { level: top ? top + 1000 : 1000, rate: 0.5 }])
  }
  const setTier = (i: number, patch: Partial<AcceptancePoint>) =>
    onAcceptanceChange(acceptance.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const removeTier = (i: number) => onAcceptanceChange(acceptance.filter((_, j) => j !== i))

  const addForward = () => {
    if (!targets.length) return
    onForwardsChange([...forwards, { id: newId('fwd'), toBoxId: targets[0].id, share: 0.5 }])
  }
  const setForward = (id: string, patch: Partial<Forward>) => {
    // Dragging one share squeezes the others so the routed total stays ≤ 100%.
    if (patch.share !== undefined) {
      const share = Math.max(0, Math.min(1, patch.share))
      const otherSum = forwards.reduce((s, f) => (f.id === id ? s : s + (f.share || 0)), 0)
      const budget = 1 - share
      const scale = otherSum > budget && otherSum > 0 ? budget / otherSum : 1
      onForwardsChange(
        forwards.map((f) => (f.id === id ? { ...f, share } : { ...f, share: (f.share || 0) * scale })),
      )
      return
    }
    onForwardsChange(forwards.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }
  const removeForward = (id: string) => onForwardsChange(forwards.filter((f) => f.id !== id))

  const showPreview = acceptance.length > 0 && !keepsEverything

  return (
    <div className="flex flex-col gap-5">
      {/* ── Acceptance curve ── */}
      <div className="flex flex-col gap-3">
        <div>
          <div className="text-sm font-medium text-ink">Acceptance</div>
          <p className="mt-0.5 text-xs text-faint">
            How much of each deposit this box keeps as it fills. Below the first tier it keeps
            everything; what it declines becomes overflow.
          </p>
        </div>

        {showPreview && (
          <div className="overflow-hidden rounded-2xl border border-line bg-sunken/20 px-2 pt-2">
            <CurvePreview points={acceptance} color={color} currency={currency} />
            <div className="flex items-center justify-center gap-4 pb-2 text-[11px] text-faint">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
                kept
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-faint/40" />
                passed on
              </span>
            </div>
          </div>
        )}

        <AnimatePresence initial={false}>
          {acceptance.map((p, i) => (
            <motion.div
              key={i}
              layout
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: -12 }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              <TierRow
                point={p}
                symbol={symbol}
                onChange={(patch) => setTier(i, patch)}
                onRemove={() => removeTier(i)}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        <button
          type="button"
          onClick={addTier}
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-line-2 py-2.5 text-sm font-medium text-faint transition-colors hover:border-clay/50 hover:text-clay"
        >
          <Plus className="size-4" />
          Add a tier
        </button>
      </div>

      {/* ── Forwards ── */}
      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-medium text-ink">Forward overflow</div>
          {forwards.length > 0 && (
            <span className="text-xs tabular text-faint">{fmtPercent(totalForwarded, 0)} routed</span>
          )}
        </div>
        <p className="-mt-1.5 text-xs text-faint">
          Send the declined money on to other boxes. Whatever you don't route stays here.
        </p>

        {targets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line-2 px-4 py-3 text-center text-xs text-faint">
            Create another box to forward overflow to.
          </div>
        ) : (
          <>
            {forwards.length > 0 && keepsEverything && (
              <div className="rounded-xl border border-honey/30 bg-honey/5 px-3 py-2 text-xs text-honey">
                Add an acceptance tier above so there's overflow to forward.
              </div>
            )}
            <AnimatePresence initial={false}>
              {forwards.map((f) => (
                <motion.div
                  key={f.id}
                  layout
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginTop: -12 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 34 }}
                >
                  <ForwardRow
                    forward={f}
                    targets={targets}
                    onChange={(patch) => setForward(f.id, patch)}
                    onRemove={() => removeForward(f.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            <button
              type="button"
              onClick={addForward}
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-line-2 py-2.5 text-sm font-medium text-faint transition-colors hover:border-clay/50 hover:text-clay"
            >
              <Plus className="size-4" />
              Add a forward
            </button>
          </>
        )}
      </div>
    </div>
  )
}
