import { Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
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
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  box?: Box
}) {
  const addBox = useStore((s) => s.addBox)
  const updateBox = useStore((s) => s.updateBox)
  const removeBox = useStore((s) => s.removeBox)
  const allBoxes = useStore((s) => s.boxes)

  const [name, setName] = useState(box?.name ?? '')
  const [kind, setKind] = useState<BoxKind>(box?.kind ?? 'checking')
  const [currency, setCurrency] = useState(box?.currency ?? 'EUR')
  const [balanceStr, setBalanceStr] = useState(String(box?.openingBalance ?? ''))
  const [openingDate, setOpeningDate] = useState(box?.openingDate ?? todayISO())
  const [color, setColor] = useState(box?.color ?? SWATCHES[0].hex)
  const [note, setNote] = useState(box?.note ?? '')
  const [effects, setEffects] = useState<Effect[]>(box?.effects ?? [])
  const [acceptance, setAcceptance] = useState<AcceptancePoint[]>(box?.acceptance ?? [])
  const [forwards, setForwards] = useState<Forward[]>(box?.forwards ?? [])
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Reset the form to reflect the target box each time the sheet opens.
  useEffect(() => {
    if (!open) return
    setName(box?.name ?? '')
    setKind(box?.kind ?? 'checking')
    setCurrency(box?.currency ?? 'EUR')
    setBalanceStr(String(box?.openingBalance ?? ''))
    setOpeningDate(box?.openingDate ?? todayISO())
    setColor(box?.color ?? SWATCHES[0].hex)
    setNote(box?.note ?? '')
    setEffects(box?.effects ?? [])
    setAcceptance(box?.acceptance ?? [])
    setForwards(box?.forwards ?? [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, box])

  const symbol = currencyMeta(currency).symbol
  // Boxes this one can spill into — everything live except itself.
  const targets = useMemo(
    () => allBoxes.filter((b) => b.id !== box?.id && !b.archived),
    [allBoxes, box?.id],
  )

  const save = () => {
    const cleanForwards = forwards.filter((f) => f.toBoxId && f.share > 0)
    const data = {
      name: name.trim() || 'Untitled box',
      kind,
      currency,
      openingBalance: parseFloat(balanceStr) || 0,
      openingDate,
      color,
      note: note.trim() || undefined,
      effects,
      acceptance: acceptance.length ? acceptance : undefined,
      forwards: cleanForwards.length ? cleanForwards : undefined,
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
      title={box ? 'Edit box' : 'New box'}
      description={box ? undefined : 'A separate place your money lives, with its own rules.'}
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
          <Button onClick={save}>{box ? 'Save changes' : 'Create box'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" htmlFor="box-name">
          <Input
            id="box-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Rainy day fund"
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
          <Field label="Opening balance">
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

        <Field label="Tracking since" hint="When this opening balance was true.">
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

        <Field
          label="Effects"
          hint="Rules that bend this box's value over time — interest, inflation, and the like."
        >
          <EffectEditor value={effects} onChange={setEffects} />
        </Field>

        <Field
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
        </Field>

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
