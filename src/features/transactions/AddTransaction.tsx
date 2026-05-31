import type { TxKind } from '@/domain'

export interface ComposerPrefill {
  kind?: TxKind
  boxId?: string
}

// Filled out in the transactions task — the composer + RhythmControl live here.
export function AddTransaction({ onDone }: { prefill: ComposerPrefill; onDone: () => void }) {
  return (
    <div className="py-10 text-center text-sm text-faint">
      The composer is coming together.
      <button className="mt-4 block w-full text-clay" onClick={onDone}>
        Close
      </button>
    </div>
  )
}
