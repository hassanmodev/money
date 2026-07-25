/**
 * The week grid — a blocked view of the full week, navigable past this week.
 * Data resolution is 10 minutes; display zoom is separate and switchable.
 *
 * Plan vs actual rendering: actuals paint solid over planned tints. A block
 * that went as planned looks calm and solid; divergence shows the planned
 * tint peeking out. Silence = success — texture only where life diverged.
 */
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import {
  DAY_MIN,
  projectColor,
  rankSlots,
  SLOTS_PER_DAY,
  STEP_MIN,
  valueAt,
  type Block,
  type Fragment,
  type ISODate,
  type Suggestion,
  type WeekData,
} from '@/domain/time'
import { cn } from '@/lib/cn'
import { hexToRgba } from '@/lib/palette'
import { useTimeStore } from '@/store/timeProjects'
import { fmtTime } from './format'
import { OptionsPopover, type SlotRequest, type ViewMode } from './OptionsPopover'
import type { Now } from './useWeekData'

const clamp = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v))
const snap = (min: number) => Math.round(min / STEP_MIN) * STEP_MIN

/** Split a block into per-day segments so overnight spans render on both days. */
interface Seg {
  day: number
  start: number
  end: number
  continuesBefore: boolean
  continuesAfter: boolean
}

function segmentsOf(
  b: { date: ISODate; startMin: number; durationMin: number },
  weekStart: ISODate,
): Seg[] {
  const anchor = differenceInCalendarDays(parseISO(b.date), parseISO(weekStart))
  const out: Seg[] = []
  let remaining = b.durationMin
  let day = anchor
  let cursor = b.startMin
  while (remaining > 0 && day <= 6) {
    const consumed = Math.min(DAY_MIN - cursor, remaining)
    if (day >= 0 && consumed > 0) {
      out.push({
        day,
        start: cursor,
        end: cursor + consumed,
        continuesBefore: day > anchor,
        continuesAfter: remaining > consumed,
      })
    }
    remaining -= consumed
    cursor = 0
    day++
  }
  return out
}

interface DragMove {
  block: Block
  moved: boolean
  startX: number
  startY: number
  grabMin: number // pointer offset below the block's top, in minutes
  date: ISODate
  startMin: number
}

export function WeekGrid({
  data,
  now,
  mode,
  pxPerHour,
  qualityId,
  selectedProjectId,
  onSelectProject,
}: {
  data: WeekData
  now: Now
  mode: ViewMode
  pxPerHour: number
  qualityId?: string
  selectedProjectId: string | null
  onSelectProject: (id: string | null) => void
}) {
  const projects = useTimeStore((s) => s.projects)
  const updateBlock = useTimeStore((s) => s.updateBlock)
  const overrideRuleOccurrence = useTimeStore((s) => s.overrideRuleOccurrence)
  const addBlock = useTimeStore((s) => s.addBlock)

  const pxPerMin = pxPerHour / 60
  const height = DAY_MIN * pxPerMin
  const [slotReq, setSlotReq] = useState<SlotRequest | null>(null)
  const [drag, setDrag] = useState<DragMove | null>(null)
  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // start the day somewhere humane
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 7 * pxPerHour })
  }, [pxPerHour, data.weekStart])

  // Esc clears the project selection (and its slot-fit glow)
  useEffect(() => {
    if (!selectedProjectId) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onSelectProject(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedProjectId, onSelectProject])

  const showPlan = mode !== 'reality'
  const showActual = mode !== 'plan'

  // slot-fit glow: where the selected project would thrive, ranked
  const glow = useMemo(() => {
    if (!selectedProjectId) return null
    const project = projects.find((p) => p.id === selectedProjectId)
    if (!project) return null
    const scoreOf = new Map(
      rankSlots(project, 60, data.scoreCtx).map((r) => [r.slot, r.score.value] as const),
    )
    const runs: { start: number; end: number; strong: boolean }[][] = Array.from(
      { length: 7 },
      () => [],
    )
    for (let d = 0; d < 7; d++) {
      let cur: { start: number; end: number; strong: boolean } | null = null
      for (let s = 0; s < SLOTS_PER_DAY; s++) {
        const v = scoreOf.get(d * SLOTS_PER_DAY + s) ?? 0
        const strong = v >= 75
        if (v >= 55) {
          if (cur && cur.strong === strong) cur.end = s + 1
          else {
            cur = { start: s, end: s + 1, strong }
            runs[d].push(cur)
          }
        } else cur = null
      }
    }
    return { runs, color: projectColor(projects, project) }
  }, [selectedProjectId, projects, data])

  const fragsByDay = useMemo(() => {
    const m: Fragment[][] = Array.from({ length: 7 }, () => [])
    for (const f of data.fragments) {
      const d = differenceInCalendarDays(parseISO(f.at), parseISO(data.weekStart))
      if (d >= 0 && d < 7) m[d].push(f)
    }
    return m
  }, [data])

  const locate = (x: number, y: number): { day: number; minute: number } | null => {
    for (let d = 0; d < 7; d++) {
      const el = colRefs.current[d]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (x >= r.left && x <= r.right) {
        return {
          day: d,
          minute: clamp(0, DAY_MIN - STEP_MIN, snap((y - r.top) / pxPerMin)),
        }
      }
    }
    return null
  }

  // ── block pointer drag (move) with click-through to options ──
  const onBlockDown = (e: RPointerEvent, b: Block) => {
    if (e.button !== 0 || drag) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = e.currentTarget.getBoundingClientRect()
    setDrag({
      block: b,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      grabMin: (e.clientY - rect.top) / pxPerMin,
      date: b.date,
      startMin: b.startMin,
    })
  }

  const onBlockMove = (e: RPointerEvent, b: Block) => {
    if (!drag || drag.block.id !== b.id) return
    if (!drag.moved) {
      const dist = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY)
      if (dist < 5) return
    }
    const loc = locate(e.clientX, e.clientY)
    if (!loc) return
    setDrag({
      ...drag,
      moved: true,
      date: data.days[loc.day],
      startMin: clamp(0, DAY_MIN - STEP_MIN, loc.minute - snap(drag.grabMin)),
    })
  }

  const onBlockUp = (e: RPointerEvent, b: Block) => {
    if (!drag || drag.block.id !== b.id) return
    if (!drag.moved) {
      setSlotReq({ date: b.date, minute: b.startMin, x: e.clientX, y: e.clientY, block: b })
    } else if (b.origin === 'rule' && b.ruleId && b.ruleKey) {
      // generated blocks stay draggable — the rule learns an override
      overrideRuleOccurrence(b.ruleId, b.ruleKey, { date: drag.date, startMin: drag.startMin })
    } else {
      updateBlock(b.id, { date: drag.date, startMin: drag.startMin })
    }
    setDrag(null)
  }

  const slotClick = (e: React.MouseEvent, iso: ISODate) => {
    const r = colRefs.current[differenceInCalendarDays(parseISO(iso), parseISO(data.weekStart))]!.getBoundingClientRect()
    const minute = clamp(0, DAY_MIN - STEP_MIN, snap((e.clientY - r.top) / pxPerMin))
    setSlotReq({ date: iso, minute, x: e.clientX, y: e.clientY })
  }

  const dropProject = (e: React.DragEvent, iso: ISODate) => {
    const projectId = e.dataTransfer.getData('application/x-project')
    if (!projectId) return
    e.preventDefault()
    const day = differenceInCalendarDays(parseISO(iso), parseISO(data.weekStart))
    const r = colRefs.current[day]!.getBoundingClientRect()
    const minute = clamp(0, DAY_MIN - STEP_MIN, snap((e.clientY - r.top) / pxPerMin))
    const project = projects.find((p) => p.id === projectId)
    addBlock({
      projectId,
      layer: 'plan',
      date: iso,
      startMin: minute,
      durationMin: project?.budget?.sessionMin ?? 60,
      origin: 'manual',
    })
  }

  // 1h zoom is ~64px/hour — label every hour; coarser zooms thin the gutter
  const labelEvery = pxPerHour >= 56 ? 1 : pxPerHour >= 30 ? 2 : pxPerHour >= 18 ? 3 : 6
  const hourLines = `repeating-linear-gradient(to bottom, transparent 0, transparent ${pxPerHour - 1}px, var(--color-line) ${pxPerHour - 1}px, var(--color-line) ${pxPerHour}px)`

  const renderBlock = (b: Block, colDay: number) => {
    const project = projects.find((p) => p.id === b.projectId)
    if (!project) return null
    const color = projectColor(projects, project)
    const isPlan = b.layer === 'plan'
    if ((isPlan && !showPlan) || (!isPlan && !showActual)) return null
    const isDragging = drag?.block.id === b.id

    // only paint segments that belong in this column — each day column maps all
    // blocks, so without the filter one block clones across the whole week
    return segmentsOf(b, data.weekStart)
      .filter((seg) => seg.day === colDay)
      .map((seg) => (
        <div
          key={`${b.id}:${seg.day}`}
          onPointerDown={(e) => onBlockDown(e, b)}
          onPointerMove={(e) => onBlockMove(e, b)}
          onPointerUp={(e) => onBlockUp(e, b)}
          className={cn(
            'absolute inset-x-1 z-10 cursor-grab touch-none select-none overflow-hidden rounded-md border px-1 py-0.5 active:cursor-grabbing',
            isDragging && 'opacity-40',
            selectedProjectId === b.projectId && 'ring-2 ring-ink/30',
            project.dim && 'z-0 opacity-75',
          )}
          style={{
            top: seg.start * pxPerMin,
            height: Math.max(4, (seg.end - seg.start) * pxPerMin),
            ...(project.dim
              ? {
                  borderColor: hexToRgba(color, 0.3),
                  backgroundImage: `repeating-linear-gradient(45deg, ${hexToRgba(color, 0.1)} 0 5px, transparent 5px 11px)`,
                }
              : isPlan
                ? { borderColor: hexToRgba(color, 0.55), backgroundColor: hexToRgba(color, 0.2) }
                : { borderColor: color, backgroundColor: hexToRgba(color, 0.85) }),
            borderRadius: `${seg.continuesBefore ? 0 : 6}px ${seg.continuesAfter ? 0 : 6}px ${seg.continuesAfter ? 0 : 6}px ${seg.continuesBefore ? 0 : 6}px`,
          }}
        >
          {!project.dim && (seg.end - seg.start) * pxPerMin >= 16 && (
            <div className={cn('truncate text-[11px] leading-tight', isPlan ? 'text-muted' : 'text-canvas-2 font-medium')} style={isPlan ? { color } : undefined}>
              {seg.continuesBefore ? '↳ ' : ''}
              {project.name}
            </div>
          )}
          {!project.dim && !seg.continuesBefore && (seg.end - seg.start) * pxPerMin >= 30 && (
            <div className={cn('truncate text-[10px] leading-tight', isPlan ? 'text-faint' : 'text-canvas-2/80')}>
              {fmtTime(b.startMin)}–{fmtTime(b.startMin + b.durationMin)}
              {b.note ? ` · ${b.note}` : ''}
            </div>
          )}
        </div>
      ))
  }

  const renderSuggestion = (s: Suggestion, colDay: number) => {
    const project = projects.find((p) => p.id === s.projectId)
    if (!project || !showPlan) return null
    const color = projectColor(projects, project)
    return segmentsOf(s, data.weekStart)
      .filter((seg) => seg.day === colDay)
      .map((seg) => (
        <button
          key={`sug:${s.projectId}:${s.date}:${s.startMin}:${seg.day}`}
          type="button"
          title={`${project.name} — suggested (scores ${s.score})${s.elastic ? ' · growth proposal' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            addBlock({ projectId: s.projectId, layer: 'plan', date: s.date, startMin: s.startMin, durationMin: s.durationMin, origin: 'manual' })
          }}
          className="absolute inset-x-1 z-[5] overflow-hidden rounded-md border border-dashed px-1 py-0.5 text-left transition-colors hover:brightness-125"
          style={{
            top: seg.start * pxPerMin,
            height: Math.max(4, (seg.end - seg.start) * pxPerMin),
            borderColor: hexToRgba(color, 0.6),
            backgroundColor: hexToRgba(color, 0.1),
          }}
        >
          {(seg.end - seg.start) * pxPerMin >= 16 && (
            <div className="truncate text-[11px] leading-tight" style={{ color }}>
              {project.name}
              {s.elastic ? ' ↑' : ''}
            </div>
          )}
        </button>
      ))
  }

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div ref={scrollRef} className="max-h-[68vh] overflow-y-auto rounded-2xl border border-line bg-sunken/20">
            <div className="grid" style={{ gridTemplateColumns: '44px repeat(7, minmax(0, 1fr))' }}>
              {/* day header */}
              <div className="sticky top-0 z-20 border-b border-r border-line bg-canvas" />
              {data.days.map((iso) => {
                const today = iso === now.date
                return (
                  <div
                    key={iso}
                    className={cn(
                      'sticky top-0 z-20 border-b border-line bg-canvas px-2 py-2 text-center last:border-r-0',
                      today && 'text-clay',
                    )}
                  >
                    <span className={cn('text-xs uppercase tracking-[0.08em]', today ? 'text-clay' : 'text-faint')}>
                      {format(parseISO(iso), 'EEE')}
                    </span>
                    <span className={cn('ml-1.5 font-serif text-base', today ? 'text-clay' : 'text-ink')}>
                      {format(parseISO(iso), 'd')}
                    </span>
                  </div>
                )
              })}

              {/* time gutter */}
              <div className="relative border-r border-line" style={{ height }}>
                {Array.from({ length: 24 }, (_, h) =>
                  h % labelEvery === 0 ? (
                    <span
                      key={h}
                      className="absolute right-1.5 -translate-y-1/2 text-[10px] text-ghost"
                      style={{ top: h * pxPerHour }}
                    >
                      {h}:00
                    </span>
                  ) : null,
                )}
              </div>

              {/* day columns */}
              {data.days.map((iso, d) => (
                <div
                  key={iso}
                  ref={(el) => {
                    colRefs.current[d] = el
                  }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) slotClick(e, iso)
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('application/x-project')) e.preventDefault()
                  }}
                  onDrop={(e) => dropProject(e, iso)}
                  className={cn('relative border-r border-line last:border-r-0', iso === now.date && 'bg-raised/20')}
                  style={{ height, backgroundImage: hourLines }}
                >
                  {/* slot-fit glow for the selected project */}
                  {glow?.runs[d].map((r, i) => (
                    <div
                      key={i}
                      className="pointer-events-none absolute inset-x-0"
                      style={{
                        top: r.start * STEP_MIN * pxPerMin,
                        height: (r.end - r.start) * STEP_MIN * pxPerMin,
                        backgroundColor: hexToRgba(glow.color, r.strong ? 0.16 : 0.06),
                      }}
                    />
                  ))}

                  {showPlan && data.planBlocks.map((b) => renderBlock(b, d))}
                  {showActual && data.actualBlocks.map((b) => renderBlock(b, d))}
                  {data.suggestions.map((s) => renderSuggestion(s, d))}

                  {/* drag ghost */}
                  {drag?.moved &&
                    drag.date === iso &&
                    (() => {
                      const project = projects.find((p) => p.id === drag.block.projectId)
                      const color = project ? projectColor(projects, project) : '#888'
                      return (
                        <div
                          className="pointer-events-none absolute inset-x-1 z-20 rounded-md border-2"
                          style={{
                            top: drag.startMin * pxPerMin,
                            height: Math.max(4, Math.min(DAY_MIN - drag.startMin, drag.block.durationMin) * pxPerMin),
                            borderColor: hexToRgba(color, 0.8),
                            backgroundColor: hexToRgba(color, 0.25),
                          }}
                        />
                      )
                    })()}

                  {/* micro-entries: a thin color-coded strip along the left edge */}
                  {showActual &&
                    fragsByDay[d].map((f, i) => {
                      const project = projects.find((p) => p.id === f.projectId)
                      if (!project) return null
                      const at = parseISO(f.at)
                      return (
                        <div
                          key={f.id}
                          title={`${project.name} · ${f.minutes}m${f.note ? ` — ${f.note}` : ''}`}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute z-10 w-[3px] rounded-full"
                          style={{
                            left: 1 + (i % 4) * 4,
                            top: (at.getHours() * 60 + at.getMinutes()) * pxPerMin,
                            height: Math.max(4, f.minutes * pxPerMin),
                            backgroundColor: projectColor(projects, project),
                          }}
                        />
                      )
                    })}

                  {/* now: a single horizontal hairline */}
                  {iso === now.date && (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-30"
                      style={{ top: now.minute * pxPerMin }}
                    >
                      <div className="h-px bg-clay" />
                      <div className="absolute -left-0.5 -top-[2.5px] size-[5px] rounded-full bg-clay" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* quality curves: projected (faint) + derived-actual (solid) per day */}
          {qualityId && (
            <div className="mt-1 grid" style={{ gridTemplateColumns: '44px repeat(7, minmax(0, 1fr))' }}>
              <div className="pr-1.5 pt-1 text-right text-[10px] uppercase tracking-[0.08em] text-faint">
                {data.scoreCtx.qualities.find((q) => q.id === qualityId)?.name ?? ''}
              </div>
              {data.days.map((iso, d) => (
                <MiniCurve key={iso} data={data} day={d} qualityId={qualityId} />
              ))}
            </div>
          )}
        </div>
      </div>

      <OptionsPopover req={slotReq} data={data} mode={mode} onClose={() => setSlotReq(null)} />
    </div>
  )
}

/** Projected and derived-actual quality timelines for one day — same family as the money sparklines. */
function MiniCurve({ data, day, qualityId }: { data: WeekData; day: number; qualityId: string }) {
  const q = data.scoreCtx.qualities.find((x) => x.id === qualityId)
  const color = q?.color ?? '#8aa0c8'
  const max = q?.max ?? 100
  const w = 96
  const h = 22
  const sample = (sim: WeekData['simPlan']) =>
    Array.from({ length: 25 }, (_, i) => valueAt(sim, qualityId, day * SLOTS_PER_DAY + i * 6))
  const points = (vals: number[]) =>
    vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - 1 - (clamp(0, max, v) / max) * (h - 2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[22px] w-full">
      <polyline points={points(sample(data.simPlan))} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1.25} />
      <polyline points={points(sample(data.simActual))} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  )
}
