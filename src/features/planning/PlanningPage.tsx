import { Flag } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { addMonthsISO, fmtDate, todayISO } from '@/lib/date'
import { fmtSignedPercent } from '@/lib/format'
import { useActiveBoxes, useProjection } from '@/store/selectors'
import { Card, Money, Segmented } from '@/ui'
import { ProjectionChart } from './ProjectionChart'

const HORIZONS = [
  { value: '1Y', months: 12 },
  { value: '5Y', months: 60 },
  { value: '10Y', months: 120 },
  { value: '30Y', months: 360 },
] as const

type HorizonKey = (typeof HORIZONS)[number]['value']

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className="mt-1 font-serif text-xl text-ink">{value}</div>
    </Card>
  )
}

export default function PlanningPage() {
  const [hk, setHk] = useState<HorizonKey>('5Y')
  const [mode, setMode] = useState<'nominal' | 'real'>('nominal')
  const boxes = useActiveBoxes()

  const months = HORIZONS.find((h) => h.value === hk)!.months
  const from = todayISO()
  const to = addMonthsISO(from, months)
  const result = useProjection({ from, to, steps: 120 })

  const endVal = mode === 'real' ? result.endReal : result.endNominal
  const growth = result.currentNominal > 0 ? endVal / result.currentNominal - 1 : 0
  const drag = result.endNominal - result.endReal

  return (
    <Page>
      <PageHeader
        title="Planning"
        subtitle="Where today's choices take you — drag across the curve to read any moment."
        actions={
          <Segmented
            value={hk}
            onChange={setHk}
            options={HORIZONS.map((h) => ({ value: h.value, label: h.value }))}
            size="sm"
          />
        }
      />

      <Card className="p-4 md:p-5">
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

        <ProjectionChart result={result} boxes={boxes} mode={mode} />

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
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
        <Stat label={`In ${hk}`} value={<Money amount={endVal} animate compact />} />
        <Stat
          label="Growth"
          value={<span className={growth >= 0 ? 'text-sage' : 'text-rust'}>{fmtSignedPercent(growth)}</span>}
        />
        <Stat label="Lost to inflation" value={<Money amount={drag} compact />} />
      </div>

      {result.milestones.length > 0 && (
        <Card className="mt-4 p-5">
          <h3 className="mb-3 font-serif text-lg text-ink">Milestones along the way</h3>
          <div className="flex flex-col gap-2.5">
            {result.milestones.map((m) => (
              <div key={m.id} className="flex items-center gap-3">
                <div className="grid size-8 place-items-center rounded-lg bg-honey/15 text-honey">
                  <Flag className="size-4" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-ink">{m.label}</div>
                  <div className="text-xs text-faint">
                    reaches <Money amount={m.value} compact className="text-muted" /> by {fmtDate(m.date)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </Page>
  )
}
