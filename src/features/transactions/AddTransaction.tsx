import { useEffect, useState } from 'react'
import { currencyMeta, type Recurrence, type Transaction, type TxKind } from '@/domain'
import { cn } from '@/lib/cn'
import { todayISO } from '@/lib/date'
import { useActiveBoxes } from '@/store/selectors'
import { useStore } from '@/store/store'
import { Button, Field, Input, Segmented, Sheet, Textarea } from '@/ui'
import { boxIcon } from '@/ui/icons'
import { normalizeCategory, validCategory } from './categories'
import { CategoryInput } from './CategoryInput'
import { RhythmControl } from './RhythmControl'

export interface ComposerPrefill {
  kind?: TxKind
  boxId?: string
  toBoxId?: string
  category?: string
  note?: string
}

const KIND_OPTIONS: { value: TxKind; label: string }[] = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

function BoxChips({
  value,
  onChange,
  exclude,
}: {
  value: string
  onChange: (id: string) => void
  exclude?: string
}) {
  const boxes = useActiveBoxes()
  return (
    <div className="flex flex-wrap gap-2">
      {boxes
        .filter((b) => b.id !== exclude)
        .map((b) => {
          const Icon = boxIcon(b)
          const active = b.id === value
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onChange(b.id)}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all duration-200',
                active ? 'border-clay/60 bg-clay/10 text-ink' : 'border-line text-muted hover:border-line-2',
              )}
            >
              <Icon className="size-4" style={{ color: b.color }} />
              {b.name}
            </button>
          )
        })}
    </div>
  )
}

export function AddTransaction({
  open,
  onOpenChange,
  prefill,
  editing,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill: ComposerPrefill
  editing?: Transaction | null
}) {
  const boxes = useActiveBoxes()
  const addTransaction = useStore((s) => s.addTransaction)
  const updateTransaction = useStore((s) => s.updateTransaction)

  const [kind, setKind] = useState<TxKind>('expense')
  const [boxId, setBoxId] = useState('')
  const [toBoxId, setToBoxId] = useState('')
  const [amountStr, setAmountStr] = useState('')
  const [category, setCategory] = useState('groceries')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [recurrence, setRecurrence] = useState<Recurrence | null>(null)

  useEffect(() => {
    if (!open) return
    if (editing) {
      setKind(editing.kind)
      setBoxId(editing.boxId)
      setToBoxId(editing.toBoxId ?? boxes.find((b) => b.id !== editing.boxId)?.id ?? '')
      setAmountStr(String(editing.amount))
      setCategory(editing.category ?? 'groceries')
      setNote(editing.note ?? '')
      setDate(editing.date)
      setRecurrence(editing.recurrence ?? null)
      return
    }
    const first = prefill.boxId ?? boxes[0]?.id ?? ''
    const prefilledTo =
      prefill.toBoxId && prefill.toBoxId !== first
        ? prefill.toBoxId
        : undefined
    const second = prefilledTo ?? boxes.find((b) => b.id !== first)?.id ?? ''
    setKind(prefill.kind ?? 'expense')
    setBoxId(first)
    setToBoxId(second)
    setAmountStr('')
    setCategory(prefill.category ?? 'groceries')
    setNote(prefill.note ?? '')
    setDate(todayISO())
    setRecurrence(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sourceBox = boxes.find((b) => b.id === boxId)
  const currency = sourceBox?.currency ?? 'EUR'
  const symbol = currencyMeta(currency).symbol
  const amount = parseFloat(amountStr) || 0

  const onDateChange = (d: string) => {
    setDate(d)
    setRecurrence((r) => (r ? { ...r, anchor: d } : r))
  }

  const valid =
    amount > 0 && boxId && (kind === 'transfer' || validCategory(category)) && (kind !== 'transfer' || (toBoxId && toBoxId !== boxId))

  const save = () => {
    if (!valid) return
    const fields = {
      kind,
      boxId,
      toBoxId: kind === 'transfer' ? toBoxId : undefined,
      amount,
      currency,
      category: kind === 'transfer' ? category || 'savings' : normalizeCategory(category),
      note: note.trim() || undefined,
      date,
      recurrence: recurrence ? { ...recurrence, anchor: date } : undefined,
    }
    if (editing) updateTransaction(editing.id, fields)
    else addTransaction(fields)
    onOpenChange(false)
  }

  const noun = kind === 'expense' ? 'expense' : kind === 'income' ? 'income' : 'transfer'
  const title = editing
    ? `Edit ${noun}`
    : kind === 'expense'
      ? 'New expense'
      : kind === 'income'
        ? 'New income'
        : 'New transfer'

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid}>
            {editing ? 'Save changes' : `Add ${kind}`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <Segmented value={kind} onChange={setKind} options={KIND_OPTIONS} className="w-full [&>button]:flex-1" />

        {/* Amount */}
        <div className="flex items-center justify-center gap-1.5 py-2">
          <span className="font-serif text-3xl text-faint">{symbol}</span>
          <input
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            autoFocus
            className="w-48 bg-transparent text-center font-serif text-5xl tabular text-ink outline-none placeholder:text-ghost"
          />
        </div>

        <Field label={kind === 'income' ? 'Into' : 'From'}>
          <BoxChips value={boxId} onChange={setBoxId} />
        </Field>

        {kind === 'transfer' && (
          <Field label="To">
            <BoxChips value={toBoxId} onChange={setToBoxId} exclude={boxId} />
          </Field>
        )}

        {kind !== 'transfer' && (
          <Field label="Category">
            <CategoryInput value={category} onChange={setCategory} />
          </Field>
        )}

        <div className="grid grid-cols-1 gap-4">
          <Field label="Date">
            <Input
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
              className="[color-scheme:dark]"
            />
          </Field>

          <Field label="Rhythm" hint="One-time, or a repeating beat into the future.">
            <RhythmControl value={recurrence} onChange={setRecurrence} anchor={date} />
          </Field>

          <Field label="Note">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was it for?"
              className="min-h-16"
            />
          </Field>
        </div>
      </div>
    </Sheet>
  )
}
