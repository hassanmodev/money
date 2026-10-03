import { ArrowDownRight, ArrowRight, ArrowUpRight, MoreHorizontal, Pencil, Scale, Target, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { type Box, type Effect } from '@/domain'
import { cn } from '@/lib/cn'
import { hexToRgba } from '@/lib/palette'
import { useBoxValue } from '@/store/selectors'
import { useStore } from '@/store/store'
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  Menu,
  MenuItem,
  Money,
  Sparkline,
} from '@/ui'
import { boxIcon, KIND_LABEL } from '@/ui/icons'
import { EFFECT_META, toneClass } from './effect-meta'
import { SetBalanceDialog } from './SetBalanceDialog'
import { useBoxSeries } from './useBoxSeries'

const pct = (r: number) => `${(r * 100).toFixed(2).replace(/\.?0+$/, '')}%`

function EffectChip({ effect }: { effect: Effect }) {
  const meta = EFFECT_META[effect.kind]
  const Arrow = meta.dir === 'up' ? ArrowUpRight : ArrowDownRight
  return (
    <Chip className={cn('gap-1', toneClass(meta.tone))}>
      <Arrow className="size-3" />
      {pct(effect.annualRate)} {meta.label}
    </Chip>
  )
}

export function BoxCard({ box, onEdit }: { box: Box; onEdit: () => void }) {
  const removeBox = useStore((s) => s.removeBox)
  const boxes = useStore((s) => s.boxes)
  const assetDepreciation = useStore((s) => s.settings.assetDepreciation ?? 0.1)
  const value = useBoxValue(box.id)
  const series = useBoxSeries(box)
  const [confirm, setConfirm] = useState(false)
  const [setBalance, setSetBalance] = useState(false)

  const Icon = boxIcon(box)

  const forwardTargets = (box.forwards ?? [])
    .map((f) => boxes.find((b) => b.id === f.toBoxId))
    .filter((b): b is Box => !!b && !b.archived)

  return (
    <>
      <Card
        interactive
        onClick={onEdit}
        className="relative flex h-full flex-col gap-4 overflow-hidden p-5"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full blur-2xl"
          style={{ background: hexToRgba(box.color, 0.18) }}
        />

        <header className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              className="grid size-10 place-items-center rounded-xl"
              style={{ backgroundColor: hexToRgba(box.color, 0.14), color: box.color }}
            >
              <Icon className="size-5" />
            </div>
            <div className="leading-tight">
              <div className="font-medium text-ink">{box.name}</div>
              <div className="text-xs text-faint">
                {KIND_LABEL[box.kind]} · {box.currency}
              </div>
            </div>
          </div>

          <Menu
            trigger={
              <Button
                size="icon"
                variant="ghost"
                aria-label="Box options"
                className="size-8 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            }
          >
            <MenuItem icon={Pencil} onSelect={onEdit}>
              Edit
            </MenuItem>
            <MenuItem icon={Scale} onSelect={() => setSetBalance(true)}>
              Set balance
            </MenuItem>
            <MenuItem icon={Trash2} danger onSelect={() => setConfirm(true)}>
              Delete
            </MenuItem>
          </Menu>
        </header>

        <div>
          <Money
            report
            amount={value}
            currency={box.currency}
            animate
            className="font-serif text-[1.7rem] leading-none text-ink"
          />
          {box.kind === 'asset' && (
            <div className="mt-2 text-xs text-muted">
              Price paid <Money amount={box.openingBalance} currency={box.currency} /> · {box.openingDate}
            </div>
          )}
        </div>

        <Sparkline data={series} color={box.color} width={320} height={40} className="w-full" />

        {/* Always reserve the footer row so cards stay the same height whether or
            not they carry effect/forward chips. */}
        <div className="mt-auto flex min-h-[1.625rem] flex-wrap gap-1.5">
          {box.fundsGoals && (
            <Chip className="gap-1 text-sage">
              <Target className="size-3" />
              Funds goals
            </Chip>
          )}
          {box.effects.map((e) => (
            <EffectChip key={e.id} effect={e} />
          ))}
          {box.kind === 'asset' && !box.effects.some((e) => e.kind === 'depreciation') && (
            <Chip className="gap-1 text-rust">
              <ArrowDownRight className="size-3" />
              {pct(assetDepreciation)} depreciation
            </Chip>
          )}
          {forwardTargets.map((t) => (
            <Chip key={t.id} className="gap-1" style={{ color: t.color }}>
              <ArrowRight className="size-3" />
              {t.name}
            </Chip>
          ))}
        </div>
      </Card>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete "${box.name}"?`}
        description="This removes the box and any transactions tied to it. This can't be undone."
        confirmLabel="Delete box"
        danger
        onConfirm={() => removeBox(box.id)}
      />

      <SetBalanceDialog box={box} open={setBalance} onOpenChange={setSetBalance} />
    </>
  )
}
