/**
 * The ranked options list — tapping an empty or occupied slot, "now" or any
 * future hour, opens every project that could go there, sorted by the scorer,
 * each with its reason line. The current occupant is listed too: "keep it" is
 * an explicit choice, not a default.
 *
 * Picking an option places it (plan mode) or records it (reality mode) — the
 * same list is the shared entry point for planning and for quick actuals.
 */
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  rankProjects,
  slotIndexFor,
  type Block,
  type ISODate,
  type Project,
  type WeekData,
} from '@/domain/time'
import { projectColor } from '@/domain/time'
import { cn } from '@/lib/cn'
import { useTimeStore } from '@/store/timeProjects'
import { Button, Input, Select } from '@/ui'
import { fmtTime } from './format'

export type ViewMode = 'plan' | 'reality' | 'both'

export interface SlotRequest {
  date: ISODate
  minute: number // snapped
  x: number
  y: number
  /** the block under the cursor, when the slot is occupied */
  block?: Block
}

const fmtDay = (iso: ISODate) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })

export function OptionsPopover({
  req,
  data,
  mode,
  onClose,
}: {
  req: SlotRequest | null
  data: WeekData
  mode: ViewMode
  onClose: () => void
}) {
  const projects = useTimeStore((s) => s.projects)
  const addBlock = useTimeStore((s) => s.addBlock)
  const removeBlock = useTimeStore((s) => s.removeBlock)
  const addFragment = useTimeStore((s) => s.addFragment)
  const skipRuleOccurrence = useTimeStore((s) => s.skipRuleOccurrence)
  const [fragmentOpen, setFragmentOpen] = useState(false)
  const [fragProject, setFragProject] = useState('')
  const [fragMinutes, setFragMinutes] = useState(20)

  // reset the fragment form when a different slot is picked (render-time adjustment)
  const [prevReq, setPrevReq] = useState(req)
  if (req !== prevReq) {
    setPrevReq(req)
    setFragmentOpen(false)
  }

  useEffect(() => {
    if (!req) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [req, onClose])

  const ranked = useMemo(() => {
    if (!req) return []
    const slot = slotIndexFor(data.weekStart, req.date, req.minute)
    if (slot < 0) return []
    return rankProjects(projects, slot, 60, data.scoreCtx).slice(0, 8)
  }, [req, projects, data])

  if (!req) return null

  const slot = slotIndexFor(data.weekStart, req.date, req.minute)
  const slotPast = slot >= 0 && slot < data.scoreCtx.firstOpenSlot
  const layer: 'plan' | 'actual' =
    mode === 'plan' ? 'plan' : mode === 'reality' ? 'actual' : slotPast ? 'actual' : 'plan'

  const place = (p: Project) => {
    if (req.block?.projectId === p.id) {
      onClose() // "keep it" — an explicit choice
      return
    }
    addBlock({
      projectId: p.id,
      layer,
      date: req.date,
      startMin: req.minute,
      durationMin: 60,
      origin: 'manual',
    })
    onClose()
  }

  const deleteBlock = () => {
    const b = req.block
    if (!b) return
    if (b.origin === 'rule' && b.ruleId && b.ruleKey) skipRuleOccurrence(b.ruleId, b.ruleKey)
    else removeBlock(b.id)
    onClose()
  }

  const markHappened = () => {
    const b = req.block
    if (!b) return
    addBlock({
      projectId: b.projectId,
      layer: 'actual',
      date: b.date,
      startMin: b.startMin,
      durationMin: b.durationMin,
      note: b.note,
      origin: 'manual',
    })
    onClose()
  }

  const addFrag = () => {
    if (!fragProject || fragMinutes <= 0) return
    addFragment({
      projectId: fragProject,
      minutes: fragMinutes,
      at: `${req.date}T${fmtTime(req.minute)}:00`,
    })
    onClose()
  }

  const left = Math.max(8, Math.min(req.x - 140, window.innerWidth - 320))
  const top = Math.max(8, Math.min(req.y - 12, window.innerHeight - 440))

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={onClose} />
      <div
        className="card-surface fixed z-50 w-[300px] p-3 shadow-lift"
        style={{ left, top }}
        role="dialog"
        aria-label="Options for this slot"
      >
        <div className="mb-2 flex items-baseline justify-between px-1">
          <div className="text-sm font-medium text-ink">
            {fmtDay(req.date)} · {fmtTime(req.minute)}
          </div>
          <div className="text-[11px] uppercase tracking-[0.08em] text-faint">
            {layer === 'plan' ? 'plan' : 'record'}
          </div>
        </div>

        {req.block && (
          <BlockRow
            block={req.block}
            projects={projects}
            slotPast={slotPast}
            onHappened={markHappened}
            onDelete={deleteBlock}
          />
        )}

        <div className="max-h-56 overflow-y-auto">
          {ranked.map(({ project, score }) => (
            <button
              key={project.id}
              type="button"
              onClick={() => place(project)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-raised',
                req.block?.projectId === project.id && 'bg-raised/60',
              )}
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: projectColor(projects, project) }}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">
                  {project.name}
                  {req.block?.projectId === project.id && (
                    <span className="ml-1.5 text-xs text-faint">(current)</span>
                  )}
                </span>
                {score.reasons[0] && (
                  <span className="block truncate text-xs text-faint">{score.reasons[0]}</span>
                )}
              </span>
              <span className="tabular shrink-0 text-xs text-muted">{score.value}</span>
            </button>
          ))}
          {ranked.length === 0 && (
            <p className="px-2 py-3 text-sm text-faint">Nothing fits here.</p>
          )}
        </div>

        {fragmentOpen ? (
          <div className="mt-2 flex items-end gap-2 border-t border-line pt-2">
            <Select
              aria-label="Fragment project"
              value={fragProject}
              onValueChange={setFragProject}
              placeholder="Project"
              className="h-9 flex-1"
              options={projects
                .filter((p) => !p.archived)
                .map((p) => ({ value: p.id, label: p.name }))}
            />
            <Input
              type="number"
              min={5}
              step={5}
              value={fragMinutes}
              onChange={(e) => setFragMinutes(Number(e.target.value))}
              className="h-9 w-20"
              aria-label="Minutes"
            />
            <Button size="sm" onClick={addFrag} disabled={!fragProject}>
              Add
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setFragmentOpen(true)}
            className="mt-2 flex w-full items-center gap-2 rounded-xl border-t border-line px-2 pt-2.5 text-sm text-faint transition-colors hover:text-muted"
          >
            <Plus className="size-4" /> fragment — a few unplanned minutes
          </button>
        )}
      </div>
    </>
  )
}

function BlockRow({
  block,
  projects,
  slotPast,
  onHappened,
  onDelete,
}: {
  block: Block
  projects: Project[]
  slotPast: boolean
  onHappened: () => void
  onDelete: () => void
}) {
  const project = projects.find((p) => p.id === block.projectId)
  if (!project) return null
  const color = projectColor(projects, project)
  return (
    <div className="mb-2 rounded-xl border border-line bg-sunken/40 px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 truncate text-sm text-ink">
          {project.name}
          <span className="ml-1.5 text-xs text-faint">
            {fmtTime(block.startMin)}–{fmtTime(block.startMin + block.durationMin)}
            {block.origin === 'rule' && ' · rule'}
          </span>
        </span>
        <button
          type="button"
          onClick={onDelete}
          aria-label="Delete block"
          className="rounded-lg p-1 text-faint transition-colors hover:text-rust"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      {block.note && <p className="mt-1 truncate text-xs text-muted">{block.note}</p>}
      {block.layer === 'plan' && slotPast && (
        <Button size="sm" variant="secondary" className="mt-2 h-7 w-full" onClick={onHappened}>
          It happened — record as actual
        </Button>
      )}
    </div>
  )
}
