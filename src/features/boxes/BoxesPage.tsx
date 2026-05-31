import { Boxes as BoxesIcon, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import type { Box } from '@/domain'
import { useActiveBoxes } from '@/store/selectors'
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

export default function BoxesPage() {
  const boxes = useActiveBoxes()
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Box | undefined>(undefined)

  const openNew = () => {
    setEditing(undefined)
    setEditorOpen(true)
  }
  const openEdit = (b: Box) => {
    setEditing(b)
    setEditorOpen(true)
  }

  return (
    <Page>
      <PageHeader
        title="Boxes"
        subtitle="The separate places your money lives — each with its own rules."
        actions={
          boxes.length > 0 && (
            <Button onClick={openNew}>
              <Plus className="size-4" />
              New box
            </Button>
          )
        }
      />

      {boxes.length === 0 ? (
        <EmptyState onNew={openNew} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boxes.map((b, i) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            >
              <BoxCard box={b} onEdit={() => openEdit(b)} />
            </motion.div>
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
