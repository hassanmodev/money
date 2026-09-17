import {
  ArrowDownLeft,
  ArrowDownWideNarrow,
  ArrowRightLeft,
  ArrowUpRight,
  Boxes as BoxesIcon,
  GripVertical,
  Plus,
  X,
} from 'lucide-react'
import { motion } from 'motion/react'
import type {
  DragEvent,
  MouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import { useEffect, useRef, useState } from 'react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { boxValueAt, toBase, type Box } from '@/domain'
import { cn } from '@/lib/cn'
import { useMediaQuery } from '@/lib/hooks'
import { useActiveBoxes, useFinanceState, usePlannedBuys } from '@/store/selectors'
import { useStore } from '@/store/store'
import { useViewDate } from '@/store/time'
import { Button, Tooltip } from '@/ui'
import { useComposer } from '@/features/transactions/ComposerProvider'
import { BoxCard } from './BoxCard'
import { BoxEditor } from './BoxEditor'
import { BoxCharts } from './BoxCharts'

type MoneyMoveEdge = 'income' | 'expense'
type MoneyMoveMode = 'drag' | 'choose'

interface Point {
  x: number
  y: number
}

interface ViewRect {
  x: number
  y: number
  width: number
  height: number
}

interface MoneyMoveState {
  mode: MoneyMoveMode
  sourceId: string
  sourceRect: ViewRect
  pointer?: Point
  edge: MoneyMoveEdge
  hoverBoxId?: string
}

interface PointerSession {
  pointerId: number
  sourceId: string
  start: Point
  element: HTMLDivElement
  started: boolean
  timer?: number
  cleanup?: () => void
}

const LONG_PRESS_MS = 380
const TOUCH_SLOP = 10

const edgeCopy: Record<MoneyMoveEdge, { label: string; detail: string }> = {
  income: { label: 'Money in', detail: 'Income into this box' },
  expense: { label: 'Money out', detail: 'Expense from this box' },
}

function rectFromElement(el: HTMLElement): ViewRect {
  const rect = el.getBoundingClientRect()
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }
}

function centerOf(rect: ViewRect): Point {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  }
}

function viewportEdge(point: Point, mobile: boolean): MoneyMoveEdge {
  if (mobile) return point.y < window.innerHeight / 2 ? 'income' : 'expense'
  return point.x < window.innerWidth / 2 ? 'income' : 'expense'
}

function boxIdFromPoint(point: Point): string | undefined {
  const el = document.elementFromPoint(point.x, point.y)
  const boxEl = el instanceof HTMLElement
    ? (el.closest('[data-box-id]') as HTMLElement | null)
    : null
  return boxEl?.dataset.boxId
}

function curvePath(from: Point, to: Point) {
  const distance = Math.abs(to.x - from.x)
  const bend = Math.max(70, distance * 0.42)
  const dir = to.x >= from.x ? 1 : -1
  return `M ${from.x} ${from.y} C ${from.x + bend * dir} ${from.y}, ${to.x - bend * dir} ${to.y}, ${to.x} ${to.y}`
}

function zoneClass(active: boolean, edge: MoneyMoveEdge, mobile: boolean) {
  return cn(
    'absolute flex items-center gap-3 rounded-2xl border px-4 py-3 text-left shadow-lift backdrop-blur-xl transition-all duration-200',
    mobile
      ? edge === 'income'
        ? 'inset-x-3 top-3 min-h-24'
        : 'inset-x-3 bottom-3 min-h-24'
      : edge === 'income'
        ? 'bottom-4 left-4 top-4 w-56 flex-col items-start justify-center'
        : 'bottom-4 right-4 top-4 w-56 flex-col items-start justify-center',
    edge === 'income'
      ? 'border-sage/35 bg-sage/10 text-sage'
      : 'border-rust/35 bg-rust/10 text-rust',
    active && (edge === 'income'
      ? 'border-sage/80 bg-sage/20 shadow-glow'
      : 'border-rust/80 bg-rust/20 shadow-glow'),
  )
}

function MoneyMoveOverlay({
  move,
  sourceBox,
  targetBox,
  mobile,
  onEdgeSelect,
  onCancel,
}: {
  move: MoneyMoveState
  sourceBox?: Box
  targetBox?: Box
  mobile: boolean
  onEdgeSelect: (edge: MoneyMoveEdge) => void
  onCancel: () => void
}) {
  const sourceCenter = centerOf(move.sourceRect)
  const activeDetail = targetBox
    ? `Transfer to ${targetBox.name}`
    : `${edgeCopy[move.edge].label}: ${sourceBox?.name ?? 'box'}`

  const zone = (edge: MoneyMoveEdge) => {
    const active = !targetBox && move.edge === edge
    const Icon = edge === 'income' ? ArrowDownLeft : ArrowUpRight
    return (
      <button
        type="button"
        className={cn(
          zoneClass(active, edge, mobile),
          move.mode === 'choose' ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        onClick={() => onEdgeSelect(edge)}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-canvas/40">
          <Icon className="size-5" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-ink">{edgeCopy[edge].label}</span>
          <span className="block text-xs leading-snug text-muted">
            {edge === 'income' ? 'Open income for' : 'Open expense from'} {sourceBox?.name ?? 'this box'}
          </span>
        </span>
      </button>
    )
  }

  return (
    <motion.div
      className="fixed inset-0 z-40 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-canvas/25 backdrop-blur-[1px]" />
      {zone('income')}
      {zone('expense')}

      {move.mode === 'choose' && (
        <div className="pointer-events-auto absolute left-1/2 top-4 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-line bg-surface/95 px-3 py-2 shadow-lift">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-clay/15 text-clay">
            <ArrowRightLeft className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink">
              Move money from {sourceBox?.name ?? 'box'}
            </span>
            <span className="block truncate text-xs text-muted">
              Pick a box, or use an edge zone
            </span>
          </span>
          <button
            type="button"
            aria-label="Cancel money move"
            className="grid size-8 shrink-0 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink"
            onClick={onCancel}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {move.pointer && (
        <>
          <svg className="absolute inset-0 size-full overflow-visible">
            <defs>
              <linearGradient id="money-drag-line" x1="0%" x2="100%" y1="0%" y2="0%">
                <stop offset="0%" stopColor="rgb(212 132 92 / 0.2)" />
                <stop offset="55%" stopColor="rgb(231 176 121 / 0.8)" />
                <stop offset="100%" stopColor="rgb(162 189 135 / 0.85)" />
              </linearGradient>
            </defs>
            <path
              d={curvePath(sourceCenter, move.pointer)}
              fill="none"
              stroke="url(#money-drag-line)"
              strokeLinecap="round"
              strokeWidth="4"
            />
            <circle cx={sourceCenter.x} cy={sourceCenter.y} r="7" fill="rgb(212 132 92)" />
          </svg>
          <motion.div
            className={cn(
              'absolute flex max-w-52 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-2xl border px-3 py-2 shadow-lift backdrop-blur-xl',
              targetBox
                ? 'border-sage/70 bg-sage/20 text-sage'
                : move.edge === 'income'
                  ? 'border-sage/60 bg-sage/18 text-sage'
                  : 'border-rust/60 bg-rust/18 text-rust',
            )}
            style={{ left: move.pointer.x, top: move.pointer.y }}
            layout
          >
            <ArrowRightLeft className="size-4 shrink-0" />
            <span className="min-w-0 truncate text-xs font-medium text-ink">
              {activeDetail}
            </span>
          </motion.div>
        </>
      )}
    </motion.div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="card-surface flex flex-col items-center gap-4 px-6 py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-raised text-clay">
        <BoxesIcon className="size-7" />
      </div>
      <div>
        <h3 className="font-serif text-xl text-ink">No boxes yet</h3>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
          Start with one place your money lives — cash, a bank account, an asset.
        </p>
      </div>
      <Button onClick={onNew}>
        <Plus className="size-4" />
        Create your first box
      </Button>
    </div>
  )
}

function moveId(ids: string[], fromId: string, toId: string) {
  const next = [...ids]
  const from = next.indexOf(fromId)
  const to = next.indexOf(toId)
  if (from < 0 || to < 0 || from === to) return ids
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export default function BoxesPage() {
  const boxes = useActiveBoxes()
  const state = useFinanceState()
  const planned = usePlannedBuys()
  const viewDate = useViewDate()
  const stackedMoveZones = useMediaQuery('(max-width: 900px)')
  const composer = useComposer()
  const reorderBoxes = useStore((s) => s.reorderBoxes)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Box | undefined>(undefined)
  const [draggingId, setDraggingId] = useState<string | undefined>(undefined)
  const [overId, setOverId] = useState<string | undefined>(undefined)
  const [moneyMove, setMoneyMove] = useState<MoneyMoveState | null>(null)
  const moneyMoveRef = useRef<MoneyMoveState | null>(null)
  const pointerSessionRef = useRef<PointerSession | null>(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    moneyMoveRef.current = moneyMove
  }, [moneyMove])

  useEffect(() => {
    return () => {
      const session = pointerSessionRef.current
      if (session?.timer) window.clearTimeout(session.timer)
    }
  }, [])

  const activeSourceBox = moneyMove
    ? boxes.find((b) => b.id === moneyMove.sourceId)
    : undefined
  const activeTargetBox = moneyMove?.hoverBoxId
    ? boxes.find((b) => b.id === moneyMove.hoverBoxId)
    : undefined

  const openNew = () => {
    setEditing(undefined)
    setEditorOpen(true)
  }
  const openEdit = (b: Box) => {
    setEditing(b)
    setEditorOpen(true)
  }

  const sortByMoney = () => {
    const ids = [...boxes]
      .sort((a, b) => {
        const aValue = toBase(boxValueAt(state, a.id, viewDate, planned), a.currency, state.settings)
        const bValue = toBase(boxValueAt(state, b.id, viewDate, planned), b.currency, state.settings)
        return bValue - aValue || a.name.localeCompare(b.name)
      })
      .map((b) => b.id)
    reorderBoxes(ids)
  }

  const onDragStart = (event: DragEvent<HTMLDivElement>, id: string) => {
    if (event.ctrlKey || moneyMoveRef.current) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    setDraggingId(id)
  }

  const onDrop = (event: DragEvent<HTMLDivElement>, targetId: string) => {
    event.preventDefault()
    const sourceId = draggingId ?? event.dataTransfer.getData('text/plain')
    if (!sourceId || sourceId === targetId) return
    reorderBoxes(moveId(boxes.map((b) => b.id), sourceId, targetId))
    setDraggingId(undefined)
    setOverId(undefined)
  }

  const releasePointerSession = () => {
    const session = pointerSessionRef.current
    if (!session) return
    if (session.timer) window.clearTimeout(session.timer)
    session.cleanup?.()
    if (session.started && session.element.hasPointerCapture(session.pointerId)) {
      session.element.releasePointerCapture(session.pointerId)
    }
    pointerSessionRef.current = null
  }

  const setSuppressClick = () => {
    suppressClickRef.current = true
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 0)
  }

  const moneyMoveSnapshot = (
    sourceId: string,
    sourceRect: ViewRect,
    point: Point,
  ): MoneyMoveState => {
    const pointedBoxId = boxIdFromPoint(point)
    const hoverBoxId =
      pointedBoxId && pointedBoxId !== sourceId ? pointedBoxId : undefined
    return {
      mode: 'drag',
      sourceId,
      sourceRect,
      pointer: point,
      edge: viewportEdge(point, stackedMoveZones),
      hoverBoxId,
    }
  }

  const startMoneyDrag = (session: PointerSession, point: Point) => {
    if (session.timer) window.clearTimeout(session.timer)
    session.started = true
    setSuppressClick()
    session.element.setPointerCapture(session.pointerId)
    const onWindowPointerMove = (event: PointerEvent) => {
      if (
        pointerSessionRef.current !== session ||
        !session.started ||
        event.pointerId !== session.pointerId
      ) return
      event.preventDefault()
      updateMoneyDrag(
        session.sourceId,
        rectFromElement(session.element),
        { x: event.clientX, y: event.clientY },
      )
    }
    const onWindowPointerUp = (event: PointerEvent) => {
      if (
        pointerSessionRef.current !== session ||
        !session.started ||
        event.pointerId !== session.pointerId
      ) return
      event.preventDefault()
      const finalMove = moneyMoveSnapshot(
        session.sourceId,
        rectFromElement(session.element),
        { x: event.clientX, y: event.clientY },
      )
      releasePointerSession()
      setMoneyMove(null)
      finishMoneyMove(finalMove)
    }
    const onWindowPointerCancel = (event: PointerEvent) => {
      if (pointerSessionRef.current !== session || event.pointerId !== session.pointerId) return
      releasePointerSession()
      setMoneyMove(null)
    }
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || pointerSessionRef.current !== session) return
      event.preventDefault()
      releasePointerSession()
      setMoneyMove(null)
    }
    window.addEventListener('pointermove', onWindowPointerMove, { passive: false })
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerCancel)
    window.addEventListener('keydown', onWindowKeyDown)
    session.cleanup = () => {
      window.removeEventListener('pointermove', onWindowPointerMove)
      window.removeEventListener('pointerup', onWindowPointerUp)
      window.removeEventListener('pointercancel', onWindowPointerCancel)
      window.removeEventListener('keydown', onWindowKeyDown)
    }
    setMoneyMove(moneyMoveSnapshot(session.sourceId, rectFromElement(session.element), point))
  }

  const updateMoneyDrag = (sourceId: string, sourceRect: ViewRect, point: Point) => {
    setMoneyMove(moneyMoveSnapshot(sourceId, sourceRect, point))
  }

  const openComposerForEdge = (sourceId: string, edge: MoneyMoveEdge) => {
    composer.open({
      kind: edge === 'income' ? 'income' : 'expense',
      boxId: sourceId,
    })
    setMoneyMove(null)
  }

  const openComposerForTransfer = (sourceId: string, targetId: string) => {
    composer.open({
      kind: 'transfer',
      boxId: sourceId,
      toBoxId: targetId,
      category: 'savings',
    })
    setMoneyMove(null)
  }

  const finishMoneyMove = (move: MoneyMoveState) => {
    if (move.hoverBoxId && move.hoverBoxId !== move.sourceId) {
      openComposerForTransfer(move.sourceId, move.hoverBoxId)
      return
    }
    openComposerForEdge(move.sourceId, move.edge)
  }

  const cancelMoneyMove = () => {
    releasePointerSession()
    setMoneyMove(null)
  }

  const startChooseMove = (sourceId: string, element?: HTMLElement | null) => {
    const boxEl =
      element ??
      (document.querySelector(`[data-box-id="${sourceId}"]`) as HTMLElement | null)
    if (!boxEl) return
    setSuppressClick()
    setMoneyMove({
      mode: 'choose',
      sourceId,
      sourceRect: rectFromElement(boxEl),
      edge: stackedMoveZones ? 'expense' : 'income',
    })
  }

  const onMoneyPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    sourceId: string,
  ) => {
    if (event.button !== 0 || moneyMoveRef.current?.mode === 'choose') return

    const point = { x: event.clientX, y: event.clientY }
    const session: PointerSession = {
      pointerId: event.pointerId,
      sourceId,
      start: point,
      element: event.currentTarget,
      started: false,
    }
    pointerSessionRef.current = session

    if (event.ctrlKey) {
      event.preventDefault()
      event.stopPropagation()
      startMoneyDrag(session, point)
      return
    }

    if (event.pointerType !== 'mouse') {
      session.timer = window.setTimeout(() => {
        if (pointerSessionRef.current === session && !session.started) {
          startMoneyDrag(session, session.start)
        }
      }, LONG_PRESS_MS)
    } else {
      pointerSessionRef.current = null
    }
  }

  const onMoneyPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    const point = { x: event.clientX, y: event.clientY }
    if (!session.started) {
      const moved = Math.hypot(point.x - session.start.x, point.y - session.start.y)
      if (moved > TOUCH_SLOP) {
        releasePointerSession()
      }
      return
    }

    event.preventDefault()
    event.stopPropagation()
    updateMoneyDrag(session.sourceId, rectFromElement(session.element), point)
  }

  const onMoneyPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return

    if (!session.started) {
      releasePointerSession()
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const point = { x: event.clientX, y: event.clientY }
    const finalMove = moneyMoveSnapshot(
      session.sourceId,
      rectFromElement(session.element),
      point,
    )
    releasePointerSession()
    setMoneyMove(null)
    finishMoneyMove(finalMove)
  }

  const onMoneyPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current
    if (!session || session.pointerId !== event.pointerId) return
    releasePointerSession()
    setMoneyMove(null)
  }

  const onCardClickCapture = (
    event: MouseEvent<HTMLDivElement>,
    boxId: string,
  ) => {
    if (suppressClickRef.current) {
      event.preventDefault()
      event.stopPropagation()
      suppressClickRef.current = false
      return
    }

    if (moneyMove?.mode === 'choose') {
      event.preventDefault()
      event.stopPropagation()
      const sourceId = moneyMove.sourceId
      if (boxId === sourceId) {
        setMoneyMove(null)
      } else {
        openComposerForTransfer(sourceId, boxId)
      }
    }
  }

  return (
    <Page>
      <PageHeader
        title="Boxes"
        subtitle="The separate places your money lives — each with its own rules."
        actions={
          boxes.length > 0 && (
            <>
              <Button variant="outline" onClick={sortByMoney}>
                <ArrowDownWideNarrow className="size-4" />
                Sort by money
              </Button>
              <Button onClick={openNew}>
                <Plus className="size-4" />
                New box
              </Button>
            </>
          )
        }
      />

      {boxes.length === 0 ? (
        <EmptyState onNew={openNew} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boxes.map((b, i) => (
            <div
              key={b.id}
              data-box-id={b.id}
              className={cn(
                'group relative h-full cursor-grab rounded-[0.65rem] outline-none transition-all active:cursor-grabbing',
                draggingId === b.id && 'opacity-60',
                overId === b.id && draggingId !== b.id && 'ring-2 ring-clay/40',
                moneyMove?.sourceId === b.id && 'ring-2 ring-clay/60 shadow-glow',
                moneyMove?.hoverBoxId === b.id && 'scale-[1.015] ring-2 ring-sage/70 shadow-glow',
                moneyMove?.mode === 'choose' && moneyMove.sourceId !== b.id && 'cursor-pointer',
              )}
              draggable={!moneyMove}
              aria-grabbed={draggingId === b.id}
              onClickCapture={(event) => onCardClickCapture(event, b.id)}
              onPointerDown={(event) => onMoneyPointerDown(event, b.id)}
              onPointerMove={onMoneyPointerMove}
              onPointerUp={onMoneyPointerUp}
              onPointerCancel={onMoneyPointerCancel}
              onDragStart={(event) => onDragStart(event, b.id)}
              onDragEnd={() => {
                setDraggingId(undefined)
                setOverId(undefined)
              }}
              onDragEnter={() => setOverId(b.id)}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => onDrop(event, b.id)}
            >
              <motion.div
                className="h-full"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              >
                <div className="pointer-events-none absolute bottom-2 right-2 z-10 grid size-7 place-items-center rounded-lg border border-line bg-raised/90 text-faint opacity-0 shadow-soft transition-opacity group-hover:opacity-100">
                  <GripVertical className="size-4" />
                </div>
                <BoxCard box={b} onEdit={() => openEdit(b)} />
                <Tooltip content="Move money from this box">
                  <button
                    type="button"
                    draggable={false}
                    aria-label={`Move money from ${b.name}`}
                    className="absolute bottom-2 left-2 z-10 grid size-8 place-items-center rounded-lg border border-line bg-raised/95 text-clay opacity-100 shadow-soft transition-all hover:border-clay/50 hover:bg-clay/10 sm:opacity-0 sm:group-hover:opacity-100"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      startChooseMove(b.id, event.currentTarget.closest('[data-box-id]'))
                    }}
                  >
                    <ArrowRightLeft className="size-4" />
                  </button>
                </Tooltip>
              </motion.div>
            </div>
          ))}
        </div>
      )}

      <BoxCharts />

      {moneyMove && (
        <MoneyMoveOverlay
          move={moneyMove}
          sourceBox={activeSourceBox}
          targetBox={activeTargetBox}
          mobile={stackedMoveZones}
          onEdgeSelect={(edge) => openComposerForEdge(moneyMove.sourceId, edge)}
          onCancel={cancelMoneyMove}
        />
      )}

      <BoxEditor
        key={editing?.id ?? 'new'}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        box={editing}
      />
    </Page>
  )
}
