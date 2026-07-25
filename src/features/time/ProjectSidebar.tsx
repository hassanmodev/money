/**
 * The project sidebar — every project with a compact progress strip covering
 * its budget period (monthly and custom budgets stay visible even though the
 * grid only shows a week). Families read as one group: sub-projects nest
 * under their parent in shades of the family hue.
 *
 * Clicking a project is the mirror query: its placed blocks highlight on the
 * grid and its best candidate slots glow — "you're here, and here's where
 * you'd thrive".
 */
import { Pencil, Plus } from 'lucide-react'
import { useMemo } from 'react'
import {
  projectColor,
  rollupTree,
  type BudgetProgress,
  type Project,
  type ProjectNode,
  type Signal,
  type UnfitReport,
} from '@/domain/time'
import { cn } from '@/lib/cn'
import { Tooltip } from '@/ui'
import { fmtHours } from './format'

export function ProjectSidebar({
  projects,
  progress,
  frAllocs,
  unfit,
  signals,
  selectedId,
  onSelect,
  onEdit,
  onNew,
  className,
}: {
  projects: Project[]
  progress: Map<string, BudgetProgress>
  frAllocs: Map<string, number>
  unfit: UnfitReport[]
  signals: Signal[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onEdit: (p: Project) => void
  onNew: () => void
  className?: string
}) {
  const tree = useMemo(() => rollupTree(projects), [projects])

  return (
    <aside className={cn('flex min-w-0 flex-col gap-1', className)}>
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[11px] uppercase tracking-[0.1em] text-faint">Projects</span>
        <button
          type="button"
          onClick={onNew}
          aria-label="New project"
          className="rounded-lg p-1 text-faint transition-colors hover:text-ink"
        >
          <Plus className="size-4" />
        </button>
      </div>
      {tree.map((node) => (
        <ProjectRow
          key={node.project.id}
          node={node}
          depth={0}
          projects={projects}
          progress={progress}
          frAllocs={frAllocs}
          unfit={unfit}
          signals={signals}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      ))}
      {tree.length === 0 && (
        <p className="px-1 py-3 text-sm text-faint">No projects yet — add one to claim some hours.</p>
      )}
    </aside>
  )
}

function ProjectRow({
  node,
  depth,
  projects,
  progress,
  frAllocs,
  unfit,
  signals,
  selectedId,
  onSelect,
  onEdit,
}: {
  node: ProjectNode
  depth: number
  projects: Project[]
  progress: Map<string, BudgetProgress>
  frAllocs: Map<string, number>
  unfit: UnfitReport[]
  signals: Signal[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onEdit: (p: Project) => void
}) {
  const p = node.project
  const color = projectColor(projects, p)
  const prog = progress.get(p.id)
  const frMin = frAllocs.get(p.id)
  const unfitReport = unfit.find((u) => u.projectId === p.id)
  const projectSignals = signals.filter((s) => s.projectId === p.id)

  return (
    <>
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData('application/x-project', p.id)}
        className={cn(
          'group relative flex w-full cursor-grab items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors',
          selectedId === p.id ? 'bg-raised' : 'hover:bg-raised/60',
          p.archived && 'opacity-45',
        )}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(selectedId === p.id ? null : p.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onSelect(selectedId === p.id ? null : p.id)}
      >
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-1.5">
            <span className={cn('truncate text-sm', selectedId === p.id ? 'text-ink' : 'text-muted')}>
              {p.name}
            </span>
            {p.fr && (
              <span className="shrink-0 tabular text-[10px] text-faint">
                {p.fr.share}fr{frMin != null ? ` · ${fmtHours(frMin / 7)}/d` : ''}
              </span>
            )}
            {projectSignals.map((s, i) => (
              <Tooltip key={i} content={s.message}>
                <span className={cn('size-1.5 shrink-0 rounded-full', s.severity === 'warn' ? 'bg-honey' : 'bg-ghost')} />
              </Tooltip>
            ))}
          </span>
          {prog && <ProgressStrip prog={prog} color={color} />}
        </span>
        {unfitReport && (
          <Tooltip content={unfitReport.reasons.join(' · ') || 'no slots left'}>
            <span className="shrink-0 rounded-full bg-rust/15 px-1.5 py-0.5 text-[10px] text-rust">
              {fmtHours(unfitReport.missingMin)} unfit
            </span>
          </Tooltip>
        )}
        <button
          type="button"
          aria-label={`Edit ${p.name}`}
          onClick={(e) => {
            e.stopPropagation()
            onEdit(p)
          }}
          className="shrink-0 rounded-lg p-1 text-ghost opacity-0 transition-all hover:text-ink group-hover:opacity-100"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
      {node.children.map((child) => (
        <ProjectRow
          key={child.project.id}
          node={child}
          depth={depth + 1}
          projects={projects}
          progress={progress}
          frAllocs={frAllocs}
          unfit={unfit}
          signals={signals}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
        />
      ))}
    </>
  )
}

/**
 * One strip per budget period: plan usage as a tinted fill, actuals solid on
 * top. For minimize budgets the mood inverts — under the cap is the goal, and
 * over it is tracked, never punished.
 */
function ProgressStrip({ prog, color }: { prog: BudgetProgress; color: string }) {
  const cap = Math.max(1, prog.capMin)
  const planPct = Math.min(100, (prog.planMin / cap) * 100)
  const actualPct = Math.min(100, (prog.actualMin / cap) * 100)
  const minimize = prog.intent === 'minimize'
  const over = prog.actualMin > prog.capMin
  return (
    <span className="mt-0.5 flex items-center gap-1.5">
      <span className="relative h-1 min-w-8 flex-1 overflow-hidden rounded-full bg-line/60">
        {!minimize && (
          <span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ width: `${planPct}%`, backgroundColor: color, opacity: 0.35 }}
          />
        )}
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${actualPct}%`,
            backgroundColor: minimize ? (over ? '#d98a7e' : '#a2bd87') : color,
          }}
        />
        {prog.capMin > prog.targetMin && (
          <span
            className="absolute inset-y-0 w-px bg-ink/40"
            style={{ left: `${(prog.targetMin / cap) * 100}%` }}
          />
        )}
      </span>
      <span className="tabular shrink-0 text-[10px] text-faint">
        {minimize
          ? `${fmtHours(prog.actualMin)} / ${fmtHours(prog.capMin)} cap`
          : `${fmtHours(prog.actualMin)} / ${fmtHours(prog.targetMin)}`}
      </span>
    </span>
  )
}
