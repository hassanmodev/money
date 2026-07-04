import { ArrowDownWideNarrow, Boxes as BoxesIcon, GripVertical, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import type { DragEvent } from 'react'
import { useState } from 'react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { boxValueAt, toBase, type Box } from '@/domain'
import { cn } from '@/lib/cn'
import { useActiveBoxes, useFinanceState, usePlannedBuys } from '@/store/selectors'
import { useStore } from '@/store/store'
import { useViewDate } from '@/store/time'
import { Button } from '@/ui'
import { BoxCard } from './BoxCard'
import { BoxEditor } from './BoxEditor'

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
  const reorderBoxes = useStore((s) => s.reorderBoxes)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Box | undefined>(undefined)
  const [draggingId, setDraggingId] = useState<string | undefined>(undefined)
  const [overId, setOverId] = useState<string | undefined>(undefined)

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
              className={cn(
                'group relative h-full cursor-grab rounded-[0.65rem] outline-none transition-shadow active:cursor-grabbing',
                draggingId === b.id && 'opacity-60',
                overId === b.id && draggingId !== b.id && 'ring-2 ring-clay/40',
              )}
              draggable
              aria-grabbed={draggingId === b.id}
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
              </motion.div>
            </div>
          ))}
        </div>
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
