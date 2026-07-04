import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { currencyMeta, type Goal, type GoalStatus, type GoalValue } from '@/domain'
import { cn } from '@/lib/cn'
import { todayISO } from '@/lib/date'
import { SWATCHES } from '@/lib/palette'
import { useStore } from '@/store/store'
import { Button, ConfirmDialog, Field, Input, Segmented, Select, Sheet, Slider, Textarea, type SelectOption } from '@/ui'
import { RatingCurveField } from './RatingCurveField'

// Sentinel option values for the group picker — kept out of any real group id.
const GROUP_NONE = '__none__'
const GROUP_NEW = '__new__'

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
  onNavigate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal?: Goal
  /** jump to editing a sibling goal in the same alternative-set, in place */
  onNavigate?: (goal: Goal) => void
}) {
  const addGoal = useStore((s) => s.addGoal)
  const updateGoal = useStore((s) => s.updateGoal)
  const removeGoal = useStore((s) => s.removeGoal)
  const allGoals = useStore((s) => s.goals)
  const goalGroups = useStore((s) => s.goalGroups)
  const addGoalGroup = useStore((s) => s.addGoalGroup)
  const updateGoalGroup = useStore((s) => s.updateGoalGroup)
  const baseCurrency = useStore((s) => s.settings.baseCurrency)
  const halfLifeMonths = useStore((s) => s.settings.happinessHalfLifeMonths ?? 24)

  const [name, setName] = useState('')
  const [costStr, setCostStr] = useState('')
  const [value, setValue] = useState<GoalValue>({ type: 'flat', rating: 50 })
  const [umbrella, setUmbrella] = useState(false)
  const [boostPct, setBoostPct] = useState(15)
  // Alternative-group membership + the group's upgrade settings.
  const [groupSel, setGroupSel] = useState(GROUP_NONE)
  const [newGroupName, setNewGroupName] = useState('')
  const [upgradable, setUpgradable] = useState(false)
  const [lossPct, setLossPct] = useState(15)
  const [status, setStatus] = useState<GoalStatus>('open')
  const [doneDate, setDoneDate] = useState(todayISO())
  const [color, setColor] = useState(SWATCHES[3].hex)
  const [note, setNote] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(goal?.name ?? '')
    setCostStr(goal?.cost != null ? String(goal.cost) : '')
    setValue(goal?.value ?? { type: 'flat', rating: 50 })
    setUmbrella(!!goal?.umbrella)
    setBoostPct(goal?.umbrella ? Math.round(goal.umbrella.boost * 100) : 15)
    const grp = goal?.groupId ? goalGroups.find((g) => g.id === goal.groupId) : undefined
    setGroupSel(goal?.groupId ?? GROUP_NONE)
    setNewGroupName('')
    setUpgradable(grp?.upgradable ?? false)
    setLossPct(grp ? Math.round((grp.upgradeLoss ?? 0.15) * 100) : 15)
    setStatus(goal?.status ?? 'open')
    setDoneDate(goal?.doneDate ?? todayISO())
    setColor(goal?.color ?? SWATCHES[3].hex)
    setNote(goal?.note ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal])

  const symbol = currencyMeta(baseCurrency).symbol

  // Switching the picker loads the chosen group's upgrade settings (or resets
  // them for "new" / "none"), so the controls below always reflect the target.
  const selectGroup = (v: string) => {
    setGroupSel(v)
    const grp = goalGroups.find((g) => g.id === v)
    setUpgradable(grp?.upgradable ?? false)
    setLossPct(grp ? Math.round((grp.upgradeLoss ?? 0.15) * 100) : 15)
  }

  const groupOptions: SelectOption[] = [
    { value: GROUP_NONE, label: 'No group' },
    ...goalGroups.map((g) => ({ value: g.id, label: g.name })),
    { value: GROUP_NEW, label: '+ New group…' },
  ]
  const inGroup = groupSel !== GROUP_NONE

  // Other goals in this goal's saved group — the alternatives you can hop between.
  const siblings = goal?.groupId ? allGoals.filter((g) => g.groupId === goal.groupId) : []

  const save = () => {
    // Resolve the group: leave it, join an existing one (refreshing its upgrade
    // settings), or spin up a new one and join that.
    let groupId: string | undefined
    if (groupSel === GROUP_NONE) {
      groupId = undefined
    } else if (groupSel === GROUP_NEW) {
      groupId = addGoalGroup({
        name: newGroupName.trim() || 'Alternatives',
        upgradable,
        upgradeLoss: lossPct / 100,
        color,
      })
    } else {
      groupId = groupSel
      updateGoalGroup(groupId, { upgradable, upgradeLoss: lossPct / 100 })
    }

    const data = {
      name: name.trim() || 'Untitled goal',
      cost: parseFloat(costStr) || 0,
      value,
      umbrella: umbrella ? { boost: boostPct / 100 } : undefined,
      groupId,
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
        {siblings.length > 1 && onNavigate && (
          <div className="flex flex-col gap-2 rounded-xl border border-line bg-sunken/30 p-3">
            <span className="text-[11px] uppercase tracking-[0.08em] text-faint">
              Alternatives{goalGroups.find((g) => g.id === goal!.groupId)?.name ? ` · ${goalGroups.find((g) => g.id === goal!.groupId)!.name}` : ''}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {siblings.map((s) => {
                const current = s.id === goal!.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => !current && onNavigate(s)}
                    aria-current={current}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                      current
                        ? 'cursor-default border-clay/50 bg-clay/10 text-ink'
                        : 'border-line text-muted hover:border-line-2 hover:text-ink',
                    )}
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

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

        <Field
          label="Umbrella"
          hint="An achieved umbrella lifts every other goal — most when it’s rated high, nothing when it’s low."
        >
          <div className="flex flex-col gap-3">
            <Segmented
              value={umbrella ? 'on' : 'off'}
              onChange={(v) => setUmbrella(v === 'on')}
              options={[
                { value: 'off', label: 'Ordinary' },
                { value: 'on', label: 'Amplifies' },
              ]}
              size="sm"
            />
            {umbrella && (
              <div className="flex items-center gap-4 rounded-xl border border-line bg-sunken/30 px-4 py-3">
                <span className="text-sm text-muted">Boost</span>
                <Slider
                  value={boostPct}
                  onValueChange={setBoostPct}
                  min={0}
                  max={100}
                  step={5}
                  aria-label="Umbrella boost"
                  className="flex-1"
                />
                <span className="w-12 text-right font-serif text-lg tabular text-ink">+{boostPct}%</span>
              </div>
            )}
          </div>
        </Field>

        <Field
          label="Alternative group"
          hint="Group competing options (e.g. cheap vs. premium) — the planner picks one for you."
        >
          <div className="flex flex-col gap-3">
            <Select value={groupSel} onValueChange={selectGroup} options={groupOptions} aria-label="Alternative group" />
            {groupSel === GROUP_NEW && (
              <Input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name, e.g. New phone"
                aria-label="New group name"
              />
            )}
            {inGroup && (
              <div className="flex flex-col gap-3 rounded-xl border border-line bg-sunken/30 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted">Allow upgrades</span>
                  <Segmented
                    value={upgradable ? 'on' : 'off'}
                    onChange={(v) => setUpgradable(v === 'on')}
                    options={[
                      { value: 'off', label: 'Pick one' },
                      { value: 'on', label: 'Can upgrade' },
                    ]}
                    size="sm"
                  />
                </div>
                {upgradable && (
                  <>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted">Upgrade loss</span>
                      <Slider
                        value={lossPct}
                        onValueChange={setLossPct}
                        min={0}
                        max={100}
                        step={5}
                        aria-label="Upgrade loss"
                        className="flex-1"
                      />
                      <span className="w-12 text-right font-serif text-lg tabular text-ink">{lossPct}%</span>
                    </div>
                    <p className="text-xs text-faint">
                      Start small, then upgrade — the old item resells for {100 - lossPct}% of its cost.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
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
