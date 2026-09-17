/**
 * The what-if studio. Lists the recurring rates flowing in and out, lets you
 * bend them — in bulk or line by line, as a percentage or a fixed amount —
 * keeps several alternatives side by side, and (only on request) writes the
 * active one back into the real model.
 */
import {
  ArrowDownRight,
  ArrowUpRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { cadenceLabel, type FinanceState } from '@/domain'
import { cn } from '@/lib/cn'
import { Button, Chip, ConfirmDialog, Input, Money, Segmented, Slider } from '@/ui'
import {
  adjustedAmount,
  clearScenario,
  flowAnnual,
  isDirty,
  netAnnual,
  recurringFlows,
  scenarioChanges,
  setBulk,
  setLine,
  type Flow,
  type FlowKind,
  type Scenario,
} from './scenario'

const signed = (n: number): string => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n)}%`

/** A tiny number field that commits a parsed value (tolerates "-", "" mid-edit). */
function NumInput({
  value,
  onCommit,
  suffix,
  className,
}: {
  value: number
  onCommit: (n: number) => void
  suffix?: string
  className?: string
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)
  return (
    <div className="relative">
      <Input
        inputMode="decimal"
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          const n = Number(draft)
          if (draft !== null && draft.trim() !== '' && Number.isFinite(n)) onCommit(n)
          setDraft(null)
        }}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className={cn('h-9 px-2.5 text-sm tabular', suffix && 'pr-7', className)}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-faint">
          {suffix}
        </span>
      )}
    </div>
  )
}

function FlowRow({
  flow,
  scenario,
  state,
  onChange,
}: {
  flow: Flow
  scenario: Scenario
  state: FinanceState
  onChange: (sc: Scenario) => void
}) {
  const { tx } = flow
  const adj = scenario.lines[tx.id]
  const mode = adj?.mode ?? 'pct'
  const overridden = !!adj

  const effPer = adjustedAmount(tx, scenario)
  const annual = flowAnnual(flow, scenario, state)
  const delta = annual - flow.annualBase
  const changed = Math.abs(delta) > 0.005

  const switchMode = (m: 'pct' | 'fixed') =>
    onChange(setLine(scenario, tx.id, m === 'fixed' ? { mode: 'fixed', value: effPer } : { mode: 'pct', value: adj?.mode === 'pct' ? adj.value : 0 }))

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2.5 transition-colors',
        overridden ? 'border-clay/30 bg-clay/[0.04]' : 'border-line bg-sunken/30',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm text-ink">
          <span className="truncate">{tx.note || tx.category || 'Flow'}</span>
          {overridden && <span className="size-1.5 shrink-0 rounded-full bg-clay" />}
        </div>
        <div className="text-xs text-faint">
          {cadenceLabel(tx.recurrence!)} · <Money amount={flow.annualBase} compact className="text-faint" />
          /yr
        </div>
      </div>

      <Segmented
        size="sm"
        value={mode}
        onChange={(m) => switchMode(m as 'pct' | 'fixed')}
        options={[
          { value: 'pct', label: '%' },
          { value: 'fixed', label: 'Set' },
        ]}
      />

      <div className="w-24">
        {mode === 'pct' ? (
          <NumInput
            value={adj?.mode === 'pct' ? adj.value : 0}
            suffix="%"
            onCommit={(n) => onChange(setLine(scenario, tx.id, { mode: 'pct', value: n }))}
          />
        ) : (
          <NumInput
            value={adj?.mode === 'fixed' ? adj.value : tx.amount}
            onCommit={(n) => onChange(setLine(scenario, tx.id, { mode: 'fixed', value: n }))}
          />
        )}
      </div>

      <div className="ml-auto flex w-28 items-center justify-end gap-1.5 text-right">
        <div>
          <div className="text-sm tabular text-ink">
            <Money report amount={annual} compact />
            <span className="text-faint">/yr</span>
          </div>
          {changed && (
            <div className={cn('text-[11px] tabular', delta >= 0 ? 'text-sage' : 'text-rust')}>
              <Money report amount={delta} compact sign />
            </div>
          )}
        </div>
        {overridden && (
          <button
            type="button"
            aria-label="Clear override"
            onClick={() => onChange(setLine(scenario, tx.id, null))}
            className="grid size-6 shrink-0 place-items-center rounded-md text-faint hover:bg-raised hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

function BulkRow({
  kind,
  scenario,
  state,
  onChange,
}: {
  kind: FlowKind
  scenario: Scenario
  state: FinanceState
  onChange: (sc: Scenario) => void
}) {
  const pct = scenario.bulk[kind]
  const flows = recurringFlows(state).filter((f) => f.kind === kind)
  const base = flows.reduce((s, f) => s + f.annualBase, 0)
  const now = flows.reduce((s, f) => s + flowAnnual(f, scenario, state), 0)
  const income = kind === 'income'
  const Icon = income ? ArrowUpRight : ArrowDownRight

  if (flows.length === 0) return null

  return (
    <div className="rounded-xl border border-line bg-sunken/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'grid size-7 place-items-center rounded-lg',
              income ? 'bg-sage/15 text-sage' : 'bg-rust/15 text-rust',
            )}
          >
            <Icon className="size-4" />
          </span>
          <div className="text-sm font-medium text-ink">All {income ? 'income' : 'expenses'}</div>
        </div>
        <div className="flex items-center gap-2 text-right">
          <div className="text-sm tabular text-ink">
            <Money report amount={now} compact />
            <span className="text-faint">/yr</span>
          </div>
          {Math.abs(now - base) > 0.005 && (
            <Chip dot={income ? '#9eb87f' : '#db8a82'}>
              <span className={now - base >= 0 ? 'text-sage' : 'text-rust'}>
                <Money report amount={now - base} compact sign />
              </span>
            </Chip>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <button
          type="button"
          aria-label="Nudge down"
          onClick={() => onChange(setBulk(scenario, kind, Math.max(-100, pct - 5)))}
          className="grid size-7 shrink-0 place-items-center rounded-lg border border-line text-muted hover:text-ink"
        >
          −
        </button>
        <Slider
          aria-label={`All ${kind} change`}
          min={-100}
          max={100}
          step={1}
          value={pct}
          onValueChange={(v) => onChange(setBulk(scenario, kind, v))}
        />
        <button
          type="button"
          aria-label="Nudge up"
          onClick={() => onChange(setBulk(scenario, kind, Math.min(100, pct + 5)))}
          className="grid size-7 shrink-0 place-items-center rounded-lg border border-line text-muted hover:text-ink"
        >
          +
        </button>
        <div
          className={cn(
            'w-14 shrink-0 text-right text-sm font-medium tabular',
            pct > 0 ? 'text-sage' : pct < 0 ? 'text-rust' : 'text-faint',
          )}
        >
          {signed(pct)}
        </div>
      </div>
    </div>
  )
}

function ScenarioTabs({
  scenarios,
  activeId,
  onSelect,
  onAdd,
  onRemove,
  onRename,
  onToggleHidden,
}: {
  scenarios: Scenario[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onRename: (id: string, name: string) => void
  onToggleHidden: (id: string) => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <div className="flex flex-wrap items-center gap-2">
      {scenarios.map((sc) => {
        const active = sc.id === activeId
        return (
          <div
            key={sc.id}
            className={cn(
              'group flex items-center gap-1.5 rounded-xl border px-2 py-1.5 transition-colors',
              active ? 'border-clay/40 bg-clay/[0.06]' : 'border-line bg-raised/40 hover:border-line-2',
            )}
          >
            <button
              type="button"
              aria-label={sc.hidden ? 'Show on chart' : 'Hide from chart'}
              onClick={() => onToggleHidden(sc.id)}
              className="grid size-5 place-items-center rounded-md text-faint hover:text-ink"
            >
              {sc.hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <span className="size-2.5 rounded-full" style={{ backgroundColor: sc.color }} />
            {editing === sc.id ? (
              <input
                autoFocus
                defaultValue={sc.name}
                onBlur={(e) => {
                  onRename(sc.id, e.target.value.trim() || sc.name)
                  setEditing(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                  if (e.key === 'Escape') setEditing(null)
                }}
                className="w-24 bg-transparent text-sm text-ink outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => onSelect(sc.id)}
                onDoubleClick={() => setEditing(sc.id)}
                className={cn('text-sm', active ? 'font-medium text-ink' : 'text-muted')}
              >
                {sc.name}
              </button>
            )}
            {active && (
              <button
                type="button"
                aria-label="Rename"
                onClick={() => setEditing(sc.id)}
                className="grid size-5 place-items-center rounded-md text-faint hover:text-ink"
              >
                <Pencil className="size-3" />
              </button>
            )}
            {scenarios.length > 1 && (
              <button
                type="button"
                aria-label="Remove scenario"
                onClick={() => onRemove(sc.id)}
                className="grid size-5 place-items-center rounded-md text-faint opacity-0 transition-opacity hover:text-rust group-hover:opacity-100"
              >
                <Trash2 className="size-3" />
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-1 rounded-xl border border-dashed border-line px-2.5 py-1.5 text-sm text-faint hover:border-line-2 hover:text-muted"
      >
        <Plus className="size-3.5" /> Alternative
      </button>
    </div>
  )
}

export function ScenarioPanel({
  state,
  scenario,
  onChange,
  scenarios,
  activeId,
  onSelect,
  onAdd,
  onRemove,
  onRename,
  onToggleHidden,
  onSave,
}: {
  state: FinanceState
  scenario: Scenario
  onChange: (sc: Scenario) => void
  scenarios: Scenario[]
  activeId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
  onRename: (id: string, name: string) => void
  onToggleHidden: (id: string) => void
  onSave: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  const flows = recurringFlows(state)
  const income = flows.filter((f) => f.kind === 'income')
  const expense = flows.filter((f) => f.kind === 'expense')
  const dirty = isDirty(state, scenario)
  const changes = scenarioChanges(state, scenario)

  const baseNet = netAnnual(state, clearScenario(scenario))
  const scNet = netAnnual(state, scenario)
  const netDelta = scNet - baseNet

  if (flows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-faint">
        No recurring income or expenses yet. Add a repeating entry on the Activity page to
        start modelling what-ifs.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ScenarioTabs
        scenarios={scenarios}
        activeId={activeId}
        onSelect={onSelect}
        onAdd={onAdd}
        onRemove={onRemove}
        onRename={onRename}
        onToggleHidden={onToggleHidden}
      />

      {/* net flow summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sunken/40 px-4 py-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.1em] text-faint">Net flow / month</div>
          <div className="font-serif text-xl text-ink">
            <Money report amount={scNet / 12} compact sign />
          </div>
        </div>
        {Math.abs(netDelta) > 0.005 && (
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.1em] text-faint">vs. model</div>
            <div className={cn('font-serif text-xl', netDelta >= 0 ? 'text-sage' : 'text-rust')}>
              <Money report amount={netDelta / 12} compact sign />
            </div>
          </div>
        )}
      </div>

      {/* bulk nudges */}
      <div className="grid gap-3 md:grid-cols-2">
        <BulkRow kind="income" scenario={scenario} state={state} onChange={onChange} />
        <BulkRow kind="expense" scenario={scenario} state={state} onChange={onChange} />
      </div>

      {/* per-flow rows */}
      {income.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-faint">Coming in</div>
          {income.map((f) => (
            <FlowRow key={f.tx.id} flow={f} scenario={scenario} state={state} onChange={onChange} />
          ))}
        </div>
      )}
      {expense.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium uppercase tracking-[0.08em] text-faint">Going out</div>
          {expense.map((f) => (
            <FlowRow key={f.tx.id} flow={f} scenario={scenario} state={state} onChange={onChange} />
          ))}
        </div>
      )}

      {/* actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <div className="text-xs text-faint">
          {dirty
            ? `${changes.length} rate${changes.length === 1 ? '' : 's'} changed in “${scenario.name}”`
            : 'No changes yet — nudge a rate above.'}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => onChange(clearScenario(scenario))}>
            <RotateCcw className="size-3.5" /> Reset
          </Button>
          <Button variant="primary" size="sm" disabled={!dirty} onClick={() => setConfirm(true)}>
            <Save className="size-3.5" /> Save to model
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Save these rates?"
        confirmLabel="Save changes"
        onConfirm={onSave}
        description={
          <span>
            This updates {changes.length} recurring {changes.length === 1 ? 'rate' : 'rates'} in your
            real model — the projection everywhere else will read the new amounts. You can always edit
            them back on the Activity page.
          </span>
        }
      />
    </div>
  )
}
