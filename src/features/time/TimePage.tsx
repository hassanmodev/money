/**
 * The Time & Projects tab. Plan the week, live it, record what actually
 * happened, see the delta, adjust — the plan is a hypothesis, not a contract.
 */
import { addDays, format, parseISO } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { weekStartFor, type Project } from '@/domain/time'
import { addDaysISO, todayISO } from '@/lib/date'
import { useTimeStore } from '@/store/timeProjects'
import { Button, Segmented, Select } from '@/ui'
import type { ViewMode } from './OptionsPopover'
import { ProjectEditor } from './ProjectEditor'
import { ProjectSidebar } from './ProjectSidebar'
import { QualityEditor } from './QualityEditor'
import { SignalsBar } from './SignalsBar'
import { useWeekData } from './useWeekData'
import { WeekGrid } from './WeekGrid'

const ZOOMS = [
  { value: '20m', label: '20m', px: 132 },
  { value: '30m', label: '30m', px: 96 },
  { value: '1h', label: '1h', px: 64 },
  { value: '2h', label: '2h', px: 40 },
  { value: '12h', label: '½d', px: 14 },
] as const
type ZoomKey = (typeof ZOOMS)[number]['value']

export default function TimePage() {
  const today = todayISO()
  const settings = useTimeStore((s) => s.settings)
  const [cursor, setCursor] = useState(today)
  const [zoom, setZoom] = useState<ZoomKey>('1h')
  const [mode, setMode] = useState<ViewMode>('both')
  const [qualityId, setQualityId] = useState<string>()
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Project | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [qualitiesOpen, setQualitiesOpen] = useState(false)

  const weekStart = weekStartFor(cursor, settings.weekStart)
  const { data, now } = useWeekData(weekStart)
  const isThisWeek = weekStart === weekStartFor(today, settings.weekStart)
  const weekEnd = addDays(parseISO(weekStart), 6)
  const px = ZOOMS.find((z) => z.value === zoom)!.px
  const effectiveQuality = qualityId ?? data.scoreCtx.qualities[0]?.id

  return (
    <Page>
      <PageHeader
        title="Time"
        subtitle="Plan the week, live it, record what actually happened — the gap is data, never failure."
        actions={
          <>
            <Button variant="outline" onClick={() => setQualitiesOpen(true)}>
              <SlidersHorizontal className="size-4" /> Qualities
            </Button>
            <Button
              onClick={() => {
                setEditing(null)
                setEditorOpen(true)
              }}
            >
              <Plus className="size-4" /> New project
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Previous week" onClick={() => setCursor(addDaysISO(weekStart, -7))}>
            <ChevronLeft className="size-5" />
          </Button>
          <button
            type="button"
            onClick={() => setCursor(today)}
            title="Back to this week"
            className="rounded-lg px-2 py-1 text-sm font-medium text-ink transition-colors hover:bg-raised"
          >
            {format(parseISO(weekStart), 'MMM d')} – {format(weekEnd, 'MMM d')}
          </button>
          <Button variant="ghost" size="icon" aria-label="Next week" onClick={() => setCursor(addDaysISO(weekStart, 7))}>
            <ChevronRight className="size-5" />
          </Button>
          {!isThisWeek && (
            <Button variant="ghost" size="sm" onClick={() => setCursor(today)}>
              This week
            </Button>
          )}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Segmented<ViewMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'plan', label: 'Plan' },
              { value: 'reality', label: 'Reality' },
              { value: 'both', label: 'Both' },
            ]}
          />
          <Segmented<ZoomKey>
            size="sm"
            value={zoom}
            onChange={setZoom}
            options={ZOOMS.map((z) => ({ value: z.value, label: z.label }))}
          />
          {data.scoreCtx.qualities.length > 0 && (
            <Select
              aria-label="Quality curve"
              value={effectiveQuality}
              onValueChange={setQualityId}
              options={data.scoreCtx.qualities.map((q) => ({ value: q.id, label: q.name }))}
              className="h-9 w-32"
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="min-w-0 w-full">
          <ProjectSidebar
            projects={data.scoreCtx.projects}
            progress={data.progress}
            frAllocs={data.frAllocs}
            unfit={data.unfit}
            signals={data.signals}
            selectedId={selected}
            onSelect={setSelected}
            onEdit={(p) => {
              setEditing(p)
              setEditorOpen(true)
            }}
            onNew={() => {
              setEditing(null)
              setEditorOpen(true)
            }}
          />
          <WeekGrid
            data={data}
            now={now}
            mode={mode}
            pxPerHour={px}
            qualityId={effectiveQuality}
            selectedProjectId={selected}
            onSelectProject={setSelected}
          />
          <SignalsBar signals={data.signals} unfit={data.unfit} projects={data.scoreCtx.projects} />
        </div>
      </div>

      <ProjectEditor project={editing} open={editorOpen} onOpenChange={setEditorOpen} />
      <QualityEditor open={qualitiesOpen} onOpenChange={setQualitiesOpen} />
    </Page>
  )
}
