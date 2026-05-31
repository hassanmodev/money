import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { Sheet } from '@/ui'
import { AddTransaction, type ComposerPrefill } from './AddTransaction'

interface ComposerApi {
  open: (prefill?: ComposerPrefill) => void
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

  const api = useMemo<ComposerApi>(
    () => ({
      open: (p) => {
        setPrefill(p ?? {})
        setOpen(true)
      },
      close: () => setOpen(false),
    }),
    [],
  )

  return (
    <ComposerContext.Provider value={api}>
      {children}
      <Sheet open={open} onOpenChange={setOpen} title="New entry">
        <AddTransaction prefill={prefill} onDone={() => setOpen(false)} />
      </Sheet>
    </ComposerContext.Provider>
  )
}
