import { CheckCircle2, RotateCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { currencyMeta, type Box, type Goal, type GoalValue } from '@/domain'
import { cn } from '@/lib/cn'
import { todayISO } from '@/lib/date'
import { SWATCHES } from '@/lib/palette'
import { useActiveBoxes } from '@/store/selectors'
import { useStore } from '@/store/store'
import { Button, ConfirmDialog, Field, Input, Sheet, Textarea } from '@/ui'
import { boxIcon } from '@/ui/icons'
import { GoalValueEditor } from './GoalValueEditor'

function ColorRow({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
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

/** Toggle which boxes pay for this goal. None selected = the whole net worth backs it. */
function FunderPicker({
  boxes,
  selected,
  onChange,
}: {
  boxes: Box[]
  selected: string[]
  onChange: (ids: string[]) => void
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((b) => b !== id) : [...selected, id])

  if (!boxes.length) return <p className="text-sm text-faint">No boxes to draw on yet.</p>

  return (
    <div className="flex flex-wrap gap-2">
      {boxes.map((b) => {
        const Icon = boxIcon(b)
        const on = selected.includes(b.id)
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => toggle(b.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-all duration-200',
              on ? 'border-transparent text-canvas' : 'border-line text-faint hover:text-muted',
            )}
            style={on ? { backgroundColor: b.color } : undefined}
          >
            <Icon className="size-4" />
            {b.name}
          </button>
        )
      })}
    </div>
  )
}

export function GoalEditor({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal?: Goal
}) {
  const addGoal = useStore((s) => s.addGoal)
  const updateGoal = useStore((s) => s.updateGoal)
  const removeGoal = useStore((s) => s.removeGoal)
  const baseCurrency = useStore((s) => s.settings.baseCurrency)
  const boxes = useActiveBoxes()

  const [label, setLabel] = useState('')
  const [costStr, setCostStr] = useState('')
  const [value, setValue] = useState<GoalValue>(5)
  const [boxIds, setBoxIds] = useState<string[]>([])
  const [color, setColor] = useState(SWATCHES[0].hex)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setLabel(goal?.label ?? '')
    setCostStr(goal ? String(goal.cost) : '')
    setValue(goal?.value ?? 5)
    setBoxIds(goal?.boxIds ?? [])
    setColor(goal?.color ?? SWATCHES[3].hex)
    setNote(goal?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal])

  const symbol = useMemo(() => currencyMeta(baseCurrency).symbol, [baseCurrency])
  const done = goal?.status === 'done'

  const save = () => {
    const data = {
      label: label.trim() || 'Untitled goal',
      cost: parseFloat(costStr) || 0,
      value,
      boxIds: boxIds.filter((id) => boxes.some((b) => b.id === id)),
      color,
      note: note.trim() || undefined,
    }
    if (goal) updateGoal(goal.id, data)
    else addGoal(data)
    onOpenChange(false)
  }

  const toggleDone = () => {
    if (!goal) return
    updateGoal(
      goal.id,
      done
        ? { status: 'open', completedDate: undefined }
        : { status: 'done', completedDate: todayISO() },
    )
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? 'Edit goal' : 'New goal'}
      description={goal ? undefined : 'Something worth saving for — and how much it would mean.'}
      footer={
        <>
          {goal && (
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
          <Button onClick={save}>{goal ? 'Save changes' : 'Create goal'}</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name" htmlFor="goal-name">
          <Input
            id="goal-name"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. House deposit"
            autoFocus={!goal}
          />
        </Field>

        <Field label="Cost" hint="What it takes to fulfil, in your base currency.">
          <div className="relative max-w-[12rem]">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">
              {symbol}
            </span>
            <Input
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="pl-8 tabular"
            />
          </div>
        </Field>

        <Field
          label="Worth"
          hint="How much happiness it brings (0–10). Make it shift over time if the moment matters."
        >
          <GoalValueEditor value={value} onChange={setValue} color={color} />
        </Field>

        <Field label="Funded by" hint="The boxes that pay for it. None = your whole net worth.">
          <FunderPicker boxes={boxes} selected={boxIds} onChange={setBoxIds} />
        </Field>

        <Field label="Color">
          <ColorRow value={color} onChange={setColor} />
        </Field>

        <Field label="Note">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why it matters…"
          />
        </Field>

        {goal && (
          <Button
            variant={done ? 'outline' : 'secondary'}
            onClick={toggleDone}
            className="self-start"
          >
            {done ? <RotateCcw className="size-4" /> : <CheckCircle2 className="size-4" />}
            {done ? 'Reopen goal' : 'Mark fulfilled'}
          </Button>
        )}
      </div>

      {goal && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete "${goal.label}"?`}
          description="This removes the goal for good. To keep it for the record, mark it fulfilled instead."
          confirmLabel="Delete goal"
          danger
          onConfirm={() => {
            removeGoal(goal.id)
            onOpenChange(false)
          }}
        />
      )}
    </Sheet>
  )
}
