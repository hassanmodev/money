/**
 * The quality editor — user-defined meters that make hours unequal. Each
 * quality has a time-of-day baseline (the passive-drift attractor), a drift
 * speed, and dependency rules referencing other qualities ("when physical <
 * 30, mental −40%"). Chains are fine; cycles are rejected here, at edit time.
 */
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import {
  TIME_SWATCHES,
  wouldCreateCycle,
  type CurvePoint,
  type Quality,
  type QualityDependency,
} from '@/domain/time'
import { cn } from '@/lib/cn'
import { useTimeStore } from '@/store/timeProjects'
import { Button, ConfirmDialog, Field, Input, Select, Sheet, Slider } from '@/ui'

const toTime = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
const toMinute = (time: string) => {
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function QualityEditor({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const qualities = useTimeStore((s) => s.qualities)
  const addQuality = useTimeStore((s) => s.addQuality)

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Qualities"
      description="Meters that make hours unequal. Every quality starts the week at full; the week wears you down from there."
      footer={
        <Button
          variant="outline"
          onClick={() =>
            addQuality({
              name: 'New quality',
              max: 100,
              baseline: [
                { minute: 0, value: 80 },
                { minute: 720, value: 100 },
                { minute: 1380, value: 40 },
              ],
            })
          }
        >
          <Plus className="size-4" /> Add quality
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {qualities.map((q) => (
          <QualityCard key={q.id} quality={q} />
        ))}
        {qualities.length === 0 && (
          <p className="py-4 text-sm text-faint">No qualities yet — add one to make hours unequal.</p>
        )}
      </div>
    </Sheet>
  )
}

function QualityCard({ quality: q }: { quality: Quality }) {
  const qualities = useTimeStore((s) => s.qualities)
  const updateQuality = useTimeStore((s) => s.updateQuality)
  const removeQuality = useTimeStore((s) => s.removeQuality)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [depError, setDepError] = useState<string | null>(null)

  const setPoint = (i: number, patch: Partial<CurvePoint>) =>
    updateQuality(q.id, { baseline: q.baseline.map((p, j) => (j === i ? { ...p, ...patch } : p)) })

  const setDep = (i: number, patch: Partial<QualityDependency>) => {
    const next = { ...q.dependsOn![i], ...patch }
    if (wouldCreateCycle(qualities, q.id, next)) {
      setDepError('That would close a dependency cycle — chains are fine, loops are not.')
      return
    }
    setDepError(null)
    updateQuality(q.id, { dependsOn: q.dependsOn!.map((d, j) => (j === i ? next : d)) })
  }

  const addDep = () => {
    const other = qualities.find((x) => x.id !== q.id)
    if (!other) return
    const dep = { on: other.id, below: 30, scale: 0.6 }
    if (wouldCreateCycle(qualities, q.id, dep)) {
      setDepError('That would close a dependency cycle — chains are fine, loops are not.')
      return
    }
    setDepError(null)
    updateQuality(q.id, { dependsOn: [...(q.dependsOn ?? []), dep] })
  }

  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="mb-3 flex items-center gap-3">
        <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: q.color ?? '#8aa0c8' }} />
        <Input value={q.name} onChange={(e) => updateQuality(q.id, { name: e.target.value })} className="h-9 flex-1" aria-label="Quality name" />
        <Input
          type="number"
          min={1}
          value={q.max}
          onChange={(e) => updateQuality(q.id, { max: Math.max(1, Number(e.target.value)) })}
          className="h-9 w-20"
          aria-label="Max"
          title="Max"
        />
        <button type="button" onClick={() => setConfirmDelete(true)} aria-label={`Delete ${q.name}`} className="rounded-lg p-1.5 text-faint hover:text-rust">
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {TIME_SWATCHES.map((hex) => (
          <button
            key={hex}
            type="button"
            aria-label={`Color ${hex}`}
            onClick={() => updateQuality(q.id, { color: hex })}
            className={cn('size-5 rounded-full transition-transform hover:scale-110', q.color === hex && 'ring-2 ring-ink/60 ring-offset-2 ring-offset-surface')}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>

      <Field label="Baseline" hint="The passive-drift attractor over the day — 9am ≠ 11pm before any project enters the picture.">
        <div className="flex flex-col gap-1.5">
          {q.baseline.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input type="time" value={toTime(p.minute)} onChange={(e) => setPoint(i, { minute: toMinute(e.target.value) })} className="h-8 w-28 px-2 text-xs" aria-label="Time of day" />
              <Input type="number" min={0} max={q.max} value={p.value} onChange={(e) => setPoint(i, { value: Number(e.target.value) })} className="h-8 w-20 px-2 text-xs" aria-label="Value" />
              <button
                type="button"
                onClick={() => updateQuality(q.id, { baseline: q.baseline.filter((_, j) => j !== i) })}
                aria-label="Remove point"
                className="rounded-lg p-1 text-faint hover:text-rust"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => updateQuality(q.id, { baseline: [...q.baseline, { minute: 720, value: Math.round(q.max / 2) }] })}
          >
            <Plus className="size-3.5" /> Point
          </Button>
        </div>
      </Field>

      <Field label={`Drift — ${(q.drift ?? 0.5).toFixed(2)}/h`} hint="How fast the quality relaxes toward its baseline.">
        <Slider value={q.drift ?? 0.5} onValueChange={(v) => updateQuality(q.id, { drift: v })} min={0.05} max={1} step={0.05} aria-label="Drift speed" />
      </Field>

      <Field label="Depends on" hint={'When another quality drops low, this one scales — "when physical < 30, mental −40%".'}>
        <div className="flex flex-col gap-1.5">
          {(q.dependsOn ?? []).map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted">
              <span className="text-faint">when</span>
              <Select
                value={d.on}
                onValueChange={(v) => setDep(i, { on: v })}
                options={qualities.filter((x) => x.id !== q.id).map((x) => ({ value: x.id, label: x.name }))}
                className="h-8 flex-1 text-xs"
                aria-label="Watched quality"
              />
              <span className="text-faint">&lt;</span>
              <Input type="number" value={d.below} onChange={(e) => setDep(i, { below: Number(e.target.value) })} className="h-8 w-16 px-2 text-xs" aria-label="Below" />
              <span className="text-faint">×</span>
              <Input type="number" min={0} max={1} step={0.05} value={d.scale} onChange={(e) => setDep(i, { scale: Number(e.target.value) })} className="h-8 w-16 px-2 text-xs" aria-label="Scale" />
              <button
                type="button"
                onClick={() => updateQuality(q.id, { dependsOn: q.dependsOn!.filter((_, j) => j !== i) })}
                aria-label="Remove dependency"
                className="rounded-lg p-1 text-faint hover:text-rust"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
          {depError && <p className="text-xs text-rust">{depError}</p>}
          <Button size="sm" variant="ghost" className="self-start" onClick={addDep} disabled={qualities.length < 2}>
            <Plus className="size-3.5" /> Dependency
          </Button>
        </div>
      </Field>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${q.name}?`}
        description="Every effect, requirement, and dependency referencing it is stripped."
        confirmLabel="Delete"
        danger
        onConfirm={() => removeQuality(q.id)}
      />
    </div>
  )
}
