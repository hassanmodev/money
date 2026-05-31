import { ArrowDownRight, ArrowUpRight, Plus, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { Compounding, Effect, EffectKind } from '@/domain'
import { cn } from '@/lib/cn'
import { newId } from '@/lib/id'
import { Button, Select, Slider } from '@/ui'
import { EFFECT_META, effectFactor, toneClass } from './effect-meta'
import { DEFAULT_EFFECT_RATE, EFFECT_KINDS } from './kinds'

const KIND_OPTIONS = EFFECT_KINDS.map((k) => ({
  value: k,
  label: k[0].toUpperCase() + k.slice(1),
}))

const COMPOUNDING_OPTIONS: { value: Compounding; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
  { value: 'continuous', label: 'Continuous' },
]

function EffectRow({
  effect,
  onChange,
  onRemove,
}: {
  effect: Effect
  onChange: (patch: Partial<Effect>) => void
  onRemove: () => void
}) {
  const meta = EFFECT_META[effect.kind]
  const Arrow = meta.dir === 'up' ? ArrowUpRight : ArrowDownRight
  const factor = effectFactor(effect, 10)
  const pct = factor - 1
  const ratePct = (effect.annualRate * 100).toFixed(2).replace(/\.?0+$/, '')

  return (
    <div className="rounded-2xl border border-line bg-sunken/30 p-4">
      <div className="flex items-center gap-2">
        <Select
          aria-label="Effect type"
          value={effect.kind}
          onValueChange={(v) =>
            onChange({ kind: v as EffectKind, annualRate: DEFAULT_EFFECT_RATE[v as EffectKind] })
          }
          options={KIND_OPTIONS}
          className="h-9 flex-1"
        />
        <Button size="icon" variant="ghost" onClick={onRemove} aria-label="Remove effect" className="size-9 shrink-0">
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <Slider
          aria-label="Annual rate"
          value={Math.min(effect.annualRate, 0.25)}
          onValueChange={(v) => onChange({ annualRate: Math.round(v * 1000) / 1000 })}
          min={0}
          max={0.25}
          step={0.0025}
          className="flex-1"
        />
        <div className="flex items-center gap-1 rounded-lg border border-line bg-sunken/40 px-2 py-1">
          <input
            value={ratePct}
            onChange={(e) => {
              const n = parseFloat(e.target.value)
              if (!Number.isNaN(n)) onChange({ annualRate: n / 100 })
            }}
            inputMode="decimal"
            className="w-12 bg-transparent text-right text-sm tabular text-ink outline-none"
          />
          <span className="text-sm text-faint">%</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <Select
          aria-label="Compounding"
          value={effect.compounding}
          onValueChange={(v) => onChange({ compounding: v as Compounding })}
          options={COMPOUNDING_OPTIONS}
          className="h-9 w-36"
        />
        <span className={cn('flex items-center gap-1 text-xs font-medium', toneClass(meta.tone))}>
          <Arrow className="size-3.5" />
          {(pct >= 0 ? '+' : '−') + Math.abs(pct * 100).toFixed(0)}%
          <span className="text-faint">over 10y</span>
        </span>
      </div>
    </div>
  )
}

export function EffectEditor({
  value,
  onChange,
}: {
  value: Effect[]
  onChange: (effects: Effect[]) => void
}) {
  const add = () =>
    onChange([
      ...value,
      { id: newId('fx'), kind: 'interest', annualRate: DEFAULT_EFFECT_RATE.interest, compounding: 'annually' },
    ])
  const update = (id: string, patch: Partial<Effect>) =>
    onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  const remove = (id: string) => onChange(value.filter((e) => e.id !== id))

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {value.map((e) => (
          <motion.div
            key={e.id}
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginTop: -12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <EffectRow effect={e} onChange={(p) => update(e.id, p)} onRemove={() => remove(e.id)} />
          </motion.div>
        ))}
      </AnimatePresence>

      <button
        type="button"
        onClick={add}
        className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-line-2 py-3 text-sm font-medium text-faint transition-colors hover:border-clay/50 hover:text-clay"
      >
        <Plus className="size-4" />
        Add an effect
      </button>
    </div>
  )
}
