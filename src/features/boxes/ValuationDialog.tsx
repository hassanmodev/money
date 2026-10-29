import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { boxValueAt, formatMoney, roundMoney, type Box, type Valuation } from '@/domain'
import { cn } from '@/lib/cn'
import { newId } from '@/lib/id'
import { useFinanceState } from '@/store/selectors'
import { useStore } from '@/store/store'
import { useViewDate } from '@/store/time'
import { Button, Field, Input, Modal } from '@/ui'

export function ValuationDialog({ box, open, onOpenChange }: {
  box: Box
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const state = useFinanceState()
  const viewDate = useViewDate()
  const upsert = useStore((s) => s.upsertValuation)
  const remove = useStore((s) => s.removeValuation)
  const [date, setDate] = useState(viewDate)
  const [valueStr, setValueStr] = useState('')
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState<Valuation>()
  const history = [...(box.valuations ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  const existing = history.find((v) => v.date === date)
  const value = Number(valueStr)
  const valid = valueStr.trim() !== '' && Number.isFinite(value) && date >= box.openingDate && /^\d{4}-\d{2}-\d{2}$/.test(date)
  const withoutObservation = {
    ...state,
    boxes: state.boxes.map((b) => b.id !== box.id ? b : {
      ...b, valuations: b.valuations?.filter((v) => v.id !== editing?.id && v.date !== date),
    }),
  }
  const expected = valid ? boxValueAt(withoutObservation, box.id, date) : 0
  const delta = roundMoney(value - expected, box.currency)

  const reset = () => {
    setEditing(undefined)
    setDate(viewDate)
    setValueStr('')
    setNote('')
  }
  const edit = (valuation: Valuation) => {
    setEditing(valuation)
    setDate(valuation.date)
    setValueStr(String(valuation.value))
    setNote(valuation.note ?? '')
  }
  const save = () => {
    if (!valid) return
    upsert(box.id, {
      id: editing?.id ?? existing?.id ?? newId('valuation'),
      createdAt: editing?.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
      date, value: roundMoney(value, box.currency), note: note.trim() || undefined,
    })
    reset()
    onOpenChange(false)
  }

  return (
    <Modal open={open} onOpenChange={(next) => { reset(); onOpenChange(next) }}
      title={`Update value — ${box.name}`}
      description="Record the total value after that day's deposits and withdrawals. Value changes count as gains or losses, separate from income and spending."
    >
      <form className="mt-5 flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); save() }}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Total value (${box.currency})`} htmlFor={`valuation-value-${box.id}`}>
            <Input id={`valuation-value-${box.id}`} value={valueStr} onChange={(e) => setValueStr(e.target.value)} inputMode="decimal" placeholder="0" autoFocus />
          </Field>
          <Field label="As of" htmlFor={`valuation-date-${box.id}`}>
            <Input id={`valuation-date-${box.id}`} type="date" value={date} min={box.openingDate} onChange={(e) => setDate(e.target.value)} className="[color-scheme:dark]" required />
          </Field>
        </div>
        {valid && <p className={cn('text-sm tabular', delta >= 0 ? 'text-sage' : 'text-rust')}>
          {formatMoney(delta, box.currency, { sign: true })} against the recorded value
        </p>}
        {existing && <p className="text-xs text-muted">Replaces the value recorded for {date}.</p>}
        <Field label="Note" htmlFor={`valuation-note-${box.id}`}>
          <Input id={`valuation-note-${box.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </Field>
        <p className="text-xs leading-relaxed text-faint">Forecast effects continue from this value. Record money moved between your boxes as a transfer.</p>
        <div className="flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={() => { reset(); onOpenChange(false) }}>Cancel</Button>
          <Button type="submit" disabled={!valid}>Save value</Button>
        </div>
      </form>
      {history.length > 0 && <div className="mt-5 border-t border-line pt-4">
        <div className="mb-2 text-xs font-medium text-muted">Value history</div>
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {history.map((valuation) => <div key={valuation.id} className="flex items-center gap-2 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <div className="tabular text-ink">{formatMoney(valuation.value, box.currency)} <span className="text-xs text-faint">· {valuation.date}</span></div>
              {valuation.note && <div className="truncate text-xs text-faint">{valuation.note}</div>}
            </div>
            <Button type="button" size="icon" variant="ghost" aria-label={`Edit value for ${valuation.date}`} onClick={() => edit(valuation)}><Pencil className="size-3.5" /></Button>
            <Button type="button" size="icon" variant="ghost" aria-label={`Delete value for ${valuation.date}`} onClick={() => { remove(box.id, valuation.id); if (editing?.id === valuation.id) reset() }}><Trash2 className="size-3.5" /></Button>
          </div>)}
        </div>
      </div>}
    </Modal>
  )
}
