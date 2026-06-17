import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Transaction } from '@/domain'
import { AddTransaction, type ComposerPrefill } from './AddTransaction'

interface ComposerApi {
  /** Open the composer to create a new entry, optionally pre-filled. */
  open: (prefill?: ComposerPrefill) => void
  /** Open the composer to edit an existing entry. */
  edit: (tx: Transaction) => void
  close: () => void
}

const ComposerContext = createContext<ComposerApi | null>(null)

/** Open the add-transaction composer from anywhere in the app. */
export function useComposer(): ComposerApi {
  const ctx = useContext(ComposerContext)
  if (!ctx) throw new Error('useComposer must be used within <ComposerProvider>')
  return ctx
}

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState<ComposerPrefill>({})
  const [editing, setEditing] = useState<Transaction | null>(null)

  const api = useMemo<ComposerApi>(
    () => ({
      open: (p) => {
        setEditing(null)
        setPrefill(p ?? {})
        setOpen(true)
      },
      edit: (tx) => {
        setEditing(tx)
        setPrefill({})
        setOpen(true)
      },
      close: () => setOpen(false),
    }),
    [],
  )

  return (
    <ComposerContext.Provider value={api}>
      {children}
      <AddTransaction open={open} onOpenChange={setOpen} prefill={prefill} editing={editing} />
    </ComposerContext.Provider>
  )
}
