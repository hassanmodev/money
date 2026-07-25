/**
 * The project editor — everything about a project in one sheet: identity and
 * code, colors (auto-with-override), budgets & placement (typed rules live
 * here too), session shaping, quality effects and requirements. Nothing is
 * built-in or special; every capability is an opt-in toggle.
 */
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  describeRule,
  parseRule,
  TIME_SWATCHES,
  type BudgetIntent,
  type BudgetPeriodKind,
  type FrScope,
  type Project,
  type QualityEffect,
  type QualityRequirement,
  type Spread,
} from '@/domain/time'
import { cn } from '@/lib/cn'
import { useTimeStore, type NewProject } from '@/store/timeProjects'
import { Button, ConfirmDialog, Field, Input, Select, Sheet, Switch, Textarea } from '@/ui'

const snap60 = (h: number) => Math.max(0, Math.round((h * 60) / 10) * 10)

interface Draft {
  name: string
  code: string
  color: string | null // null = auto
  dim: boolean
  note: string
  hasBudget: boolean
  intent: BudgetIntent
  minH: number
  maxH: number
  periodKind: BudgetPeriodKind
  customDays: number
  sessionMinM: number
  sessionMaxM: number
  spread: Spread
  hasFr: boolean
  frShare: number
  frScope: FrScope
  requires: QualityRequirement[]
  effects: QualityEffect[]
}

const draftOf = (p: Project | null): Draft => ({
  name: p?.name ?? '',
  code: p?.code ?? '',
  color: p?.color ?? null,
  dim: p?.dim ?? false,
  note: p?.note ?? '',
  hasBudget: !!p?.budget,
  intent: p?.budget?.intent ?? 'target',
  minH: (p?.budget?.min ?? 120) / 60,
  maxH: (p?.budget?.max ?? 120) / 60,
  periodKind: p?.budget?.period.kind ?? 'week',
  customDays: p?.budget?.period.days ?? 7,
  sessionMinM: p?.budget?.sessionMin ?? 0,
  sessionMaxM: p?.budget?.sessionMax ?? 0,
  spread: p?.budget?.spread ?? 'any',
  hasFr: !!p?.fr,
  frShare: p?.fr?.share ?? 1,
  frScope: p?.fr?.scope ?? 'global',
  requires: p?.requires ?? [],
  effects: p?.effects ?? [],
})

export function ProjectEditor({
  project,
  open,
  onOpenChange,
}: {
  /** null = creating a new project */
  project: Project | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const qualities = useTimeStore((s) => s.qualities)
  const addProject = useTimeStore((s) => s.addProject)
  const updateProject = useTimeStore((s) => s.updateProject)
  const removeProject = useTimeStore((s) => s.removeProject)
  const addRule = useTimeStore((s) => s.addRule)
  const [draft, setDraft] = useState<Draft>(() => draftOf(project))
  /** Rules typed while creating — committed with the new project on save. */
  const [pendingRules, setPendingRules] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  const [prev, setPrev] = useState({ open, project })
  if (open !== prev.open || project !== prev.project) {
    setPrev({ open, project })
    if (open) {
      setDraft(draftOf(project))
      setPendingRules([])
      setConfirmDelete(false)
    }
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const qOptions = qualities.map((q) => ({ value: q.id, label: q.name }))
  const valid = draft.name.trim().length > 0

  const save = () => {
    if (!valid) return
    const out: NewProject = {
      name: draft.name.trim(),
      code: draft.code.trim() || undefined,
      color: draft.color ?? undefined,
      dim: draft.dim || undefined,
      note: draft.note.trim() || undefined,
      effects: draft.effects.filter((e) => e.quality),
      requires: draft.requires.filter((r) => r.quality),
      budget: draft.hasBudget
        ? {
            min: snap60(Math.min(draft.minH, draft.maxH)),
            max: snap60(Math.max(draft.minH, draft.maxH)),
            intent: draft.intent,
            period: { kind: draft.periodKind, days: draft.periodKind === 'custom' ? Math.max(1, draft.customDays) : undefined },
            sessionMin: draft.sessionMinM > 0 ? Math.round(draft.sessionMinM / 10) * 10 : undefined,
            sessionMax: draft.sessionMaxM > 0 ? Math.round(draft.sessionMaxM / 10) * 10 : undefined,
            spread: draft.spread,
          }
        : undefined,
      fr: draft.hasFr ? { share: Math.max(0.1, draft.frShare), scope: draft.frScope } : undefined,
      archived: project?.archived,
    }
    if (project) updateProject(project.id, out)
    else {
      const id = addProject(out)
      for (const text of pendingRules) addRule(id, text)
    }
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={project ? project.name : 'New project'}
      description="A project is anything that takes time — no special kinds."
      footer={
        <>
          {project && (
            <Button variant="danger" size="sm" className="mr-auto" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid}>
            {project ? 'Save' : 'Add project'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Name">
          <Input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="Reading" autoFocus />
        </Field>

        <Field label="Code" hint="Optional namespace — ent-screen-phone reads as phone under screen under ent. Codes are the only hierarchy.">
          <Input value={draft.code} onChange={(e) => set('code', e.target.value)} placeholder="ent-read" />
        </Field>

        <Field label="Color" hint="Auto assigns a family hue; sub-projects shade the parent.">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => set('color', null)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-xs',
                draft.color === null ? 'border-clay text-ink' : 'border-line text-faint hover:text-muted',
              )}
            >
              Auto
            </button>
            {TIME_SWATCHES.map((hex) => (
              <button
                key={hex}
                type="button"
                aria-label={`Color ${hex}`}
                onClick={() => set('color', hex)}
                className={cn('size-6 rounded-full transition-transform hover:scale-110', draft.color === hex && 'ring-2 ring-ink/60 ring-offset-2 ring-offset-surface')}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>
        </Field>

        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-ink">Background project</div>
            <div className="text-xs text-faint">Rendered dimmed and hatched — like sleep.</div>
          </div>
          <Switch checked={draft.dim} onCheckedChange={(v) => set('dim', v)} aria-label="Background project" />
        </div>

        {/* ── budget ── */}
        <div className="rounded-2xl border border-line p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium text-ink">Budget</div>
            <Switch checked={draft.hasBudget} onCheckedChange={(v) => set('hasBudget', v)} aria-label="Has budget" />
          </div>
          {draft.hasBudget && (
            <div className="flex flex-col gap-3">
              <Field label="Intent">
                <Select
                  value={draft.intent}
                  onValueChange={(v) => set('intent', v as BudgetIntent)}
                  options={[
                    { value: 'target', label: 'Target — a plain amount' },
                    { value: 'maximize', label: 'Maximize — grow toward the cap' },
                    { value: 'minimize', label: 'Minimize — stay under the cap' },
                  ]}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={draft.intent === 'target' ? 'Hours' : 'Low end (h)'}>
                  <Input type="number" min={0} step={0.5} value={draft.minH} onChange={(e) => set('minH', Number(e.target.value))} />
                </Field>
                <Field label="Cap (h)" hint={draft.intent === 'minimize' ? 'Under it is the goal; over it is tracked, never punished.' : undefined}>
                  <Input type="number" min={0} step={0.5} value={draft.maxH} onChange={(e) => set('maxH', Number(e.target.value))} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Period">
                  <Select
                    value={draft.periodKind}
                    onValueChange={(v) => set('periodKind', v as BudgetPeriodKind)}
                    options={[
                      { value: 'day', label: 'Daily' },
                      { value: 'week', label: 'Weekly' },
                      { value: 'month', label: 'Monthly' },
                      { value: 'custom', label: 'Custom window' },
                    ]}
                  />
                </Field>
                {draft.periodKind === 'custom' && (
                  <Field label="Days">
                    <Input type="number" min={1} value={draft.customDays} onChange={(e) => set('customDays', Number(e.target.value))} />
                  </Field>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Session min (min)" hint="0 = no shaping">
                  <Input type="number" min={0} step={10} value={draft.sessionMinM || ''} onChange={(e) => set('sessionMinM', Number(e.target.value))} placeholder="0" />
                </Field>
                <Field label="Session max (min)">
                  <Input type="number" min={0} step={10} value={draft.sessionMaxM || ''} onChange={(e) => set('sessionMaxM', Number(e.target.value))} placeholder="0" />
                </Field>
              </div>
              <Field label="Distribution" hint="Cluster keeps sessions together; scatter pushes them apart across the period.">
                <Select
                  value={draft.spread}
                  onValueChange={(v) => set('spread', v as Spread)}
                  options={[
                    { value: 'any', label: "Don't care" },
                    { value: 'cluster', label: 'Cluster' },
                    { value: 'scatter', label: 'Scatter' },
                  ]}
                />
              </Field>
            </div>
          )}
        </div>

        {/* ── fr share ── */}
        <div className="rounded-2xl border border-line p-4">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-sm font-medium text-ink">Free-pool share (fr)</div>
            <Switch checked={draft.hasFr} onCheckedChange={(v) => set('hasFr', v)} aria-label="Has fr share" />
          </div>
          <p className="mb-3 text-xs text-faint">After placed and budgeted claims resolve, fr shares split what's left — CSS-style.</p>
          {draft.hasFr && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Share">
                <Input type="number" min={0.1} step={0.5} value={draft.frShare} onChange={(e) => set('frShare', Number(e.target.value))} />
              </Field>
              <Field label="Scope">
                <Select
                  value={draft.frScope}
                  onValueChange={(v) => set('frScope', v as FrScope)}
                  options={[
                    { value: 'global', label: 'Global free pool' },
                    { value: 'family', label: "Top-level family's share" },
                    { value: 'parent', label: "Direct parent's share" },
                  ]}
                />
              </Field>
            </div>
          )}
        </div>

        {/* ── quality requirements & effects ── */}
        <QualityRows
          title="Requirements"
          hint="What this project prefers to run well — deep work wants mental ≥ 60."
          rows={draft.requires}
          qOptions={qOptions}
          onAdd={() => set('requires', [...draft.requires, { quality: qualities[0]?.id ?? '', min: 50 }])}
          onChange={(i, r) => set('requires', draft.requires.map((x, j) => (j === i ? r : x)))}
          onRemove={(i) => set('requires', draft.requires.filter((_, j) => j !== i))}
          render={(r, setR) => (
            <Input type="number" min={0} value={r.min} onChange={(e) => setR({ ...r, min: Number(e.target.value) })} className="w-20" aria-label="Minimum value" />
          )}
        />
        <QualityRows
          title="Effects"
          hint="Give/take as opening cost + per-hour rate — 3 to open, 1 each more hour."
          rows={draft.effects}
          qOptions={qOptions}
          onAdd={() => set('effects', [...draft.effects, { quality: qualities[0]?.id ?? '', open: 0, rate: -1 }])}
          onChange={(i, r) => set('effects', draft.effects.map((x, j) => (j === i ? r : x)))}
          onRemove={(i) => set('effects', draft.effects.filter((_, j) => j !== i))}
          render={(r, setR) => (
            <>
              <Input type="number" value={r.open} onChange={(e) => setR({ ...r, open: Number(e.target.value) })} className="w-16" aria-label="Opening cost" title="Opening cost" />
              <Input type="number" step={0.5} value={r.rate} onChange={(e) => setR({ ...r, rate: Number(e.target.value) })} className="w-16" aria-label="Per-hour rate" title="Per-hour rate" />
            </>
          )}
        />

        {/* ── typed rules — draft until save when creating ── */}
        <RuleList
          projectId={project?.id}
          pending={pendingRules}
          onPendingChange={setPendingRules}
        />

        <Field label="Note">
          <Textarea value={draft.note} onChange={(e) => set('note', e.target.value)} placeholder="What is this for?" />
        </Field>

        {project && (
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-ink">Archived</div>
              <div className="text-xs text-faint">Hidden from suggestions and options; history stays.</div>
            </div>
            <Switch checked={!!project.archived} onCheckedChange={(v) => updateProject(project.id, { archived: v || undefined })} aria-label="Archived" />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${project?.name}?`}
        description="Its blocks, rules, and fragments go with it. Children keep their codes."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (project) removeProject(project.id)
          onOpenChange(false)
        }}
      />
    </Sheet>
  )
}

function QualityRows<T extends { quality: string }>({
  title,
  hint,
  rows,
  qOptions,
  onAdd,
  onChange,
  onRemove,
  render,
}: {
  title: string
  hint: string
  rows: T[]
  qOptions: { value: string; label: string }[]
  onAdd: () => void
  onChange: (i: number, r: T) => void
  onRemove: (i: number) => void
  render: (r: T, setR: (r: T) => void) => React.ReactNode
}) {
  return (
    <Field label={title} hint={hint}>
      <div className="flex flex-col gap-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select value={r.quality} onValueChange={(v) => onChange(i, { ...r, quality: v })} options={qOptions} className="h-9 flex-1" aria-label="Quality" />
            {render(r, (next) => onChange(i, next))}
            <button type="button" onClick={() => onRemove(i)} aria-label="Remove" className="rounded-lg p-1 text-faint hover:text-rust">
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={onAdd} className="self-start" disabled={qOptions.length === 0}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </Field>
  )
}

/** Typed rules stamp repetition — live-parse each line as it's edited. */
function RuleList({
  projectId,
  pending,
  onPendingChange,
}: {
  /** undefined while creating — rules stay in `pending` until the project is saved */
  projectId?: string
  pending: string[]
  onPendingChange: (rules: string[]) => void
}) {
  const rules = useTimeStore((s) => s.rules)
  const addRule = useTimeStore((s) => s.addRule)
  const updateRule = useTimeStore((s) => s.updateRule)
  const removeRule = useTimeStore((s) => s.removeRule)
  const [text, setText] = useState('')
  const mine = projectId ? rules.filter((r) => r.projectId === projectId) : []
  const parsed = text.trim() ? parseRule(text) : null

  const commit = () => {
    if (!parsed?.ok) return
    const next = text.trim()
    if (projectId) addRule(projectId, next)
    else onPendingChange([...pending, next])
    setText('')
  }

  return (
    <Field label="Recurring rules" hint={'Small text rules — "mon–fri 9–17", "daily 1-5", "first sat 14:00 for 2h". Generated blocks stay draggable and count toward budgets.'}>
      <div className="flex flex-col gap-2">
        {mine.map((r) => {
          const p = parseRule(r.text)
          return (
            <div key={r.id} className="flex items-center gap-2">
              <Input
                defaultValue={r.text}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (v && v !== r.text && parseRule(v).ok) updateRule(r.id, { text: v })
                }}
                className="h-9 flex-1"
              />
              <span className={cn('w-32 truncate text-xs', p.ok ? 'text-sage' : 'text-rust')}>
                {p.ok ? describeRule(p.rule) : "won't parse"}
              </span>
              <button type="button" onClick={() => removeRule(r.id)} aria-label="Delete rule" className="rounded-lg p-1 text-faint hover:text-rust">
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        })}
        {pending.map((r, i) => {
          const p = parseRule(r)
          return (
            <div key={`pending-${i}`} className="flex items-center gap-2">
              <Input
                defaultValue={r}
                onBlur={(e) => {
                  const v = e.target.value.trim()
                  if (!v || !parseRule(v).ok) return
                  onPendingChange(pending.map((x, j) => (j === i ? v : x)))
                }}
                className="h-9 flex-1"
              />
              <span className={cn('w-32 truncate text-xs', p.ok ? 'text-sage' : 'text-rust')}>
                {p.ok ? describeRule(p.rule) : "won't parse"}
              </span>
              <button
                type="button"
                onClick={() => onPendingChange(pending.filter((_, j) => j !== i))}
                aria-label="Delete rule"
                className="rounded-lg p-1 text-faint hover:text-rust"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        })}
        <div className="flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="daily 1-5"
            className="h-9 flex-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
            }}
          />
          <Button size="sm" variant="outline" disabled={!parsed?.ok} onClick={commit}>
            <Plus className="size-4" /> Rule
          </Button>
        </div>
        {parsed && !parsed.ok && <p className="text-xs text-rust">{parsed.error}</p>}
        {parsed?.ok && <p className="text-xs text-sage">{describeRule(parsed.rule)}</p>}
      </div>
    </Field>
  )
}
