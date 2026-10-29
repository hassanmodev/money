import { Target, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  boxEffects,
  currencyMeta,
  type AcceptancePoint,
  type Box,
  type BoxKind,
  type Effect,
  type Forward,
} from '@/domain'
import { cn } from '@/lib/cn'
import { SWATCHES } from '@/lib/palette'
import { todayISO } from '@/lib/date'
import { newId } from '@/lib/id'
import { useStore } from '@/store/store'
import { Button, ConfirmDialog, CurrencyPicker, Field, Input, Sheet, Textarea } from '@/ui'
import { KIND_ICON, KIND_LABEL } from '@/ui/icons'
import { EffectEditor } from './EffectEditor'
import { FlowEditor } from './FlowEditor'
import { BOX_KINDS } from './kinds'

function KindPicker({ value, onChange }: { value: BoxKind; onChange: (k: BoxKind) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {BOX_KINDS.map((k) => {
        const Icon = KIND_ICON[k]
        const active = k === value
        return (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-[11px] font-medium transition-all duration-200',
              active
                ? 'border-clay/60 bg-clay/10 text-ink'
                : 'border-line text-faint hover:border-line-2 hover:text-muted',
            )}
          >
            <Icon className="size-5" />
            {KIND_LABEL[k]}
          </button>
        )
      })}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {SWATCHES.map((s) => (
        <button
          key={s.key}
          type="button"
          aria-label={s.name}
          onClick={() => onChange(s.hex)}
          className={cn(
            'size-8 rounded-full transition-all duration-200',
            value === s.hex
              ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface'
              : 'opacity-75 hover:opacity-100',
          )}
          style={{ backgroundColor: s.hex }}
        />
      ))}
    </div>
  )
}

export function BoxEditor({
  open,
  onOpenChange,
  box,
  initialKind = 'checking',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  box?: Box
  initialKind?: BoxKind
}) {
  const addBox = useStore((s) => s.addBox)
  const updateBox = useStore((s) => s.updateBox)
  const removeBox = useStore((s) => s.removeBox)
  const allBoxes = useStore((s) => s.boxes)
  const baseCurrency = useStore((s) => s.settings.baseCurrency)
  const assetDepreciation = useStore((s) => s.settings.assetDepreciation ?? 0.1)

  const [name, setName] = useState(box?.name ?? '')
  const [kind, setKind] = useState<BoxKind>(box?.kind ?? initialKind)
  const [currency, setCurrency] = useState(box?.currency ?? baseCurrency)
  const [balanceStr, setBalanceStr] = useState(String(box?.openingBalance ?? ''))
  const [openingDate, setOpeningDate] = useState(box?.openingDate ?? todayISO())
  const [color, setColor] = useState(box?.color ?? SWATCHES[0].hex)
  const [note, setNote] = useState(box?.note ?? '')
  const [effects, setEffects] = useState<Effect[]>(box?.effects ?? [])
  const [acceptance, setAcceptance] = useState<AcceptancePoint[]>(box?.acceptance ?? [])
  const [forwards, setForwards] = useState<Forward[]>(box?.forwards ?? [])
  const [fundsGoals, setFundsGoals] = useState(box?.fundsGoals ?? false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset the form to reflect the target box each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setName(box?.name ?? '')
    setKind(box?.kind ?? initialKind)
    setCurrency(box?.currency ?? baseCurrency)
    setBalanceStr(String(box?.openingBalance ?? ''))
    setOpeningDate(box?.openingDate ?? todayISO())
    setColor(box?.color ?? SWATCHES[0].hex)
    setNote(box?.note ?? '')
    setEffects(box?.effects ?? [])
    setAcceptance(box?.acceptance ?? [])
    setForwards(box?.forwards ?? [])
    setFundsGoals(box?.fundsGoals ?? false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, box, initialKind])

  const symbol = currencyMeta(currency).symbol
  // Boxes this one can spill into — everything live except itself.
  const targets = useMemo(
    () => allBoxes.filter((b) => b.id !== box?.id && !b.archived && b.kind !== 'asset'),
    [allBoxes, box?.id],
  )

  const save = () => {
    const cleanForwards = forwards.filter((f) => targets.some((b) => b.id === f.toBoxId) && f.share > 0)
    const data = {
      name: name.trim() || 'Untitled box',
      kind,
      currency,
      openingBalance: parseFloat(balanceStr) || 0,
      openingDate,
      color,
      note: note.trim() || undefined,
      effects: boxEffects(kind, effects),
      acceptance: kind !== 'asset' && acceptance.length ? acceptance : undefined,
      forwards: kind !== 'asset' && cleanForwards.length ? cleanForwards : undefined,
      fundsGoals: kind !== 'asset' && fundsGoals || undefined,
      icon: box?.icon,
    }
    if (box) updateBox(box.id, data)
    else addBox(data)
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={box ? kind === 'asset' ? 'Edit asset' : 'Edit box' : kind === 'asset' ? 'New asset' : 'New box'}
      description={box ? undefined : kind === 'asset' ? 'Track a purchase and its value over time.' : 'A separate place your money lives, with its own rules.'}
      footer={
        <>
          {box && (
            <Button
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
              className="mr-auto text-rust hover:bg-rust/10"
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>{box ? 'Save changes' : kind === 'asset' ? 'Create asset' : 'Create box'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" htmlFor="box-name">
          <Input
            id="box-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'asset' ? 'e.g. Laptop' : 'e.g. Rainy day fund'}
            autoFocus={!box}
          />
        </Field>

        <Field label="Type">
          <KindPicker value={kind} onChange={setKind} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Currency">
            <CurrencyPicker value={currency} onChange={setCurrency} aria-label="Currency" />
          </Field>
          <Field label={kind === 'asset' ? 'Price paid' : 'Opening balance'}>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
                {symbol}
              </span>
              <Input
                value={balanceStr}
                onChange={(e) => setBalanceStr(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                className="pl-8 tabular"
              />
            </div>
          </Field>
        </div>

        <Field label={kind === 'asset' ? 'Purchase date' : 'Tracking since'} hint={kind === 'asset' ? 'Depreciation starts on this date.' : 'When this opening balance was true.'}>
          <Input
            type="date"
            value={openingDate}
            onChange={(e) => setOpeningDate(e.target.value)}
            className="[color-scheme:dark]"
          />
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>

        {kind !== 'asset' && <Field
          label="Funds goals"
          hint="Add this box to the shared pool your goal planner spends — the best goals draw from it first."
        >
          <button
            type="button"
            role="switch"
            aria-checked={fundsGoals}
            onClick={() => setFundsGoals((on) => !on)}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-all duration-200',
              fundsGoals
                ? 'border-clay/50 bg-clay/10 text-ink'
                : 'border-line text-faint hover:border-line-2 hover:text-muted',
            )}
          >
            <span className="flex items-center gap-2">
              <Target className="size-4" />
              {fundsGoals ? 'In the goal-funding pool' : 'Not funding goals'}
            </span>
            <span
              className={cn(
                'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200',
                fundsGoals ? 'bg-clay' : 'bg-line-2',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 size-4 rounded-full bg-surface transition-all duration-200',
                  fundsGoals ? 'left-[1.125rem]' : 'left-0.5',
                )}
              />
            </span>
          </button>
        </Field>}

        <Field
          label={kind === 'asset' ? 'Value changes' : kind === 'investment' || kind === 'crypto' ? 'Forecast effects' : 'Effects'}
          hint={kind === 'asset' ? 'Appreciation and depreciation change the value of what you own.'
            : kind === 'investment' || kind === 'crypto'
              ? 'Estimated growth or decline between value updates. Use Update value in the box menu to record actual performance.'
              : "Rules that bend this box's value over time — interest, inflation, and the like."}
        >
          {kind === 'asset' && !effects.some((e) => e.kind === 'depreciation') && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>{assetDepreciation * 100}% annual depreciation · from settings</span>
              <Button variant="outline" onClick={() => setEffects([...effects, {
                id: newId('fx'), kind: 'depreciation', annualRate: assetDepreciation, compounding: 'annually',
              }])}>Set own depreciation</Button>
            </div>
          )}
          <EffectEditor
            value={boxEffects(kind, effects)}
            onChange={setEffects}
            allowedKinds={kind === 'asset' ? ['depreciation', 'appreciation'] : undefined}
          />
        </Field>

        {kind !== 'asset' && <Field
          label="Spillover"
          hint="Keep only part of what flows in, and pass the rest on to other boxes."
        >
          <FlowEditor
            acceptance={acceptance}
            onAcceptanceChange={setAcceptance}
            forwards={forwards}
            onForwardsChange={setForwards}
            currency={currency}
            color={color}
            targets={targets}
          />
        </Field>}

        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering…" />
        </Field>
      </div>

      {box && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete "${box.name}"?`}
          description="This removes the box and any transactions tied to it. This can't be undone."
          confirmLabel="Delete box"
          danger
          onConfirm={() => {
            removeBox(box.id)
            onOpenChange(false)
          }}
        />
      )}
    </Sheet>
  )
}
