import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { currencyMeta, type Goal, type GoalStatus, type GoalValue } from '@/domain'
import { cn } from '@/lib/cn'
import { todayISO } from '@/lib/date'
import { SWATCHES } from '@/lib/palette'
import { useActiveBoxes } from '@/store/selectors'
import { useStore } from '@/store/store'
import { Button, ConfirmDialog, Field, Input, Segmented, Sheet, Textarea } from '@/ui'
import { RatingCurveField } from './RatingCurveField'

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
            value === s.hex ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'opacity-75 hover:opacity-100',
          )}
          style={{ backgroundColor: s.hex }}
        />
      ))}
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
  const halfLifeMonths = useStore((s) => s.settings.happinessHalfLifeMonths ?? 24)
  const boxes = useActiveBoxes()

  const [name, setName] = useState('')
  const [costStr, setCostStr] = useState('')
  const [value, setValue] = useState<GoalValue>({ type: 'flat', rating: 5 })
  const [boxIds, setBoxIds] = useState<string[]>([])
  const [status, setStatus] = useState<GoalStatus>('open')
  const [doneDate, setDoneDate] = useState(todayISO())
  const [color, setColor] = useState(SWATCHES[3].hex)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(goal?.name ?? '')
    setCostStr(goal?.cost != null ? String(goal.cost) : '')
    setValue(goal?.value ?? { type: 'flat', rating: 5 })
    setBoxIds(goal?.boxIds ?? [])
    setStatus(goal?.status ?? 'open')
    setDoneDate(goal?.doneDate ?? todayISO())
    setColor(goal?.color ?? SWATCHES[3].hex)
    setNote(goal?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal])

  const symbol = currencyMeta(baseCurrency).symbol
  const toggleBox = (id: string) =>
    setBoxIds((ids) => (ids.includes(id) ? ids.filter((b) => b !== id) : [...ids, id]))

  const save = () => {
    const data = {
      name: name.trim() || 'Untitled goal',
      cost: parseFloat(costStr) || 0,
      value,
      boxIds,
      status,
      doneDate: status === 'done' ? doneDate : undefined,
      color,
      note: note.trim() || undefined,
    }
    if (goal) updateGoal(goal.id, data)
    else addGoal(data)
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={goal ? 'Edit goal' : 'New goal'}
      description={goal ? undefined : 'Something worth money that buys happiness.'}
      footer={
        <>
          {goal && (
            <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="mr-auto text-rust hover:bg-rust/10">
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
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Two weeks in Japan"
            autoFocus={!goal}
          />
        </Field>

        <Field label="Cost" hint="What it takes to make it happen, in your base currency.">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted">{symbol}</span>
            <Input
              value={costStr}
              onChange={(e) => setCostStr(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              className="pl-8 tabular"
            />
          </div>
        </Field>

        <Field label="Worth" hint="How much happiness it brings — sooner counts more.">
          <RatingCurveField value={value} onChange={setValue} halfLifeMonths={halfLifeMonths} color={color} />
        </Field>

        <Field label="Funded by" hint="Boxes the spend is drawn from when you achieve it.">
          {boxes.length === 0 ? (
            <p className="text-sm text-faint">No boxes yet — add one to fund a goal.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {boxes.map((b) => {
                const on = boxIds.includes(b.id)
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBox(b.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-all duration-200',
                      on ? 'border-clay/50 bg-clay/10 text-ink' : 'border-line text-faint hover:border-line-2 hover:text-muted',
                    )}
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: b.color }} />
                    {b.name}
                  </button>
                )
              })}
            </div>
          )}
        </Field>

        <Field label="Color">
          <ColorPicker value={color} onChange={setColor} />
        </Field>

        <Field label="Status">
          <div className="flex flex-col gap-3">
            <Segmented
              value={status}
              onChange={setStatus}
              options={[
                { value: 'open', label: 'Open' },
                { value: 'done', label: 'Achieved' },
                { value: 'dismissed', label: 'Shelved' },
              ]}
              size="sm"
            />
            {status === 'done' && (
              <Input
                type="date"
                value={doneDate}
                onChange={(e) => setDoneDate(e.target.value)}
                aria-label="Achieved on"
                className="[color-scheme:dark]"
              />
            )}
          </div>
        </Field>

        <Field label="Note">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering…" />
        </Field>
      </div>

      {goal && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete "${goal.name}"?`}
          description="This removes the goal for good. Achieved goals are usually worth shelving instead."
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
