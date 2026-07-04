import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { project } from '@/domain'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { addMonthsISO } from '@/lib/date'
import { fmtSignedPercent } from '@/lib/format'
import { useActiveBoxes, useFinanceState, usePlannedBuys, useProjection } from '@/store/selectors'
import { useStore } from '@/store/store'
import { useViewDate } from '@/store/time'
import { Card, Chip, Money, Segmented } from '@/ui'
import { HorizonControl } from './HorizonControl'
import { horizonLabel } from './horizon'
import { ProjectionChart, type Overlay } from './ProjectionChart'
import { ScenarioPanel } from './ScenarioPanel'
import {
  applyScenario,
  clearScenario,
  isDirty,
  newScenario,
  scenarioChanges,
  type Scenario,
} from './scenario'

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className="mt-1 font-serif text-xl text-ink">{value}</div>
    </Card>
  )
}

const topLine = (
  pts: { nominal: number; real: number }[],
  mode: 'nominal' | 'real',
): number[] => pts.map((p) => (mode === 'real' ? p.real : p.nominal))

export default function PlanningPage() {
  const state = useFinanceState()
  const boxes = useActiveBoxes()
  const updateTransaction = useStore((s) => s.updateTransaction)

  const [months, setMonths] = useState(12)
  const [mode, setMode] = useState<'nominal' | 'real'>('nominal')

  const from = useViewDate()
  const to = addMonthsISO(from, months)
  const opts = useMemo(() => ({ from, to, steps: 120 }), [from, to])
  const result = useProjection(opts)
  // Scenario overlays ride the same planned buys as the baseline, so every line
  // dips on the same goal dates as the model line.
  const plannedBuys = usePlannedBuys()

  // ── scenarios: ephemeral what-if overlays, only baked into the model on save ──
  const [scenarios, setScenarios] = useState<Scenario[]>(() => [newScenario('Scenario A')])
  const [activeId, setActiveId] = useState(() => scenarios[0].id)
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0]

  const patchActive = (sc: Scenario) =>
    setScenarios((list) => list.map((s) => (s.id === active.id ? sc : s)))

  const addScenario = () =>
    setScenarios((list) => {
      const sc = newScenario(
        `Scenario ${String.fromCharCode(65 + list.length)}`,
        list.map((s) => s.color),
      )
      setActiveId(sc.id)
      return [...list, sc]
    })

  const removeScenario = (id: string) =>
    setScenarios((list) => {
      if (list.length <= 1) return list
      const next = list.filter((s) => s.id !== id)
      if (id === activeId) setActiveId(next[0].id)
      return next
    })

  const renameScenario = (id: string, name: string) =>
    setScenarios((list) => list.map((s) => (s.id === id ? { ...s, name } : s)))

  const toggleHidden = (id: string) =>
    setScenarios((list) => list.map((s) => (s.id === id ? { ...s, hidden: !s.hidden } : s)))

  const saveActive = () => {
    for (const c of scenarioChanges(state, active)) updateTransaction(c.txId, { amount: c.to })
    patchActive(clearScenario(active))
  }

  // overlay lines for every visible scenario that actually changes something
  const overlays = useMemo<Overlay[]>(
    () =>
      scenarios
        .filter((s) => !s.hidden && isDirty(state, s))
        .map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          values: topLine(project(applyScenario(state, s), opts, plannedBuys).points, mode),
        })),
    [scenarios, state, opts, mode, plannedBuys],
  )

  const endVal = mode === 'real' ? result.endReal : result.endNominal
  const growth = result.currentNominal > 0 ? endVal / result.currentNominal - 1 : 0
  const drag = result.endNominal - result.endReal

  // active scenario's endpoint, for the comparison strip
  const activeDirty = isDirty(state, active)
  const activeResult = useMemo(
    () => (activeDirty ? project(applyScenario(state, active), opts, plannedBuys) : null),
    [activeDirty, state, active, opts, plannedBuys],
  )
  const scenarioEnd = activeResult ? (mode === 'real' ? activeResult.endReal : activeResult.endNominal) : null

  return (
    <Page>
      <PageHeader
        title="Planning"
        subtitle="Bend the rates flowing in and out — watch where today's choices land."
      />

      <Card className="p-4 md:p-5">
        <HorizonControl months={months} onChange={setMonths} />
      </Card>

      <Card className="mt-4 p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-muted">Net worth over time</h2>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'nominal', label: 'Nominal' },
              { value: 'real', label: 'Real' },
            ]}
            size="sm"
          />
        </div>

        <ProjectionChart result={result} boxes={boxes} mode={mode} overlays={overlays} />

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-0.5 w-4 rounded-full bg-ink" />
            Today's model
          </div>
          {overlays.map((o) => (
            <div key={o.id} className="flex items-center gap-1.5 text-xs text-muted">
              <span
                className="h-0 w-4 border-t-2 border-dashed"
                style={{ borderColor: o.color }}
              />
              {o.name}
            </div>
          ))}
          <span className="mx-1 h-3 w-px bg-line" />
          {boxes.map((b) => (
            <div key={b.id} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: b.color }} />
              {b.name}
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Today" value={<Money amount={result.currentNominal} compact />} />
        <Stat label={`In ${horizonLabel(months)}`} value={<Money amount={endVal} animate compact />} />
        <Stat
          label="Growth"
          value={<span className={growth >= 0 ? 'text-sage' : 'text-rust'}>{fmtSignedPercent(growth)}</span>}
        />
        <Stat label="Lost to inflation" value={<Money amount={drag} compact />} />
      </div>

      {scenarioEnd !== null && (
        <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: active.color }} />
            <span className="font-medium text-ink">{active.name}</span> in {horizonLabel(months)}
          </div>
          <div className="flex items-center gap-3">
            <div className="font-serif text-xl text-ink">
              <Money amount={scenarioEnd} compact />
            </div>
            <Chip dot={scenarioEnd - endVal >= 0 ? '#9eb87f' : '#db8a82'}>
              <span className={scenarioEnd - endVal >= 0 ? 'text-sage' : 'text-rust'}>
                <Money amount={scenarioEnd - endVal} compact sign /> vs model
              </span>
            </Chip>
          </div>
        </Card>
      )}

      <Card className="mt-4 p-4 md:p-5">
        <h2 className="mb-4 font-serif text-lg text-ink">What if…</h2>
        <ScenarioPanel
          state={state}
          scenario={active}
          onChange={patchActive}
          scenarios={scenarios}
          activeId={active.id}
          onSelect={setActiveId}
          onAdd={addScenario}
          onRemove={removeScenario}
          onRename={renameScenario}
          onToggleHidden={toggleHidden}
          onSave={saveActive}
        />
      </Card>

    </Page>
  )
}
