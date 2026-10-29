import { ChevronDown, ChevronUp } from 'lucide-react'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { boxValueAt, toBase, type Box } from '@/domain'
import { useMediaQuery } from '@/lib/hooks'
import { useFinanceState, usePlannedBuys } from '@/store/selectors'
import { useViewDate } from '@/store/time'
import { Money } from '@/ui'
import { collapsedBoxCount } from './collapseBoxes'

export function CollapsibleBoxes({ boxes, tiles = false, children }: {
  boxes: Box[]
  tiles?: boolean
  children: (visible: Box[]) => ReactNode
}) {
  const state = useFinanceState()
  const planned = usePlannedBuys()
  const date = useViewDate()
  const medium = useMediaQuery('(min-width: 640px)')
  const wide = useMediaQuery('(min-width: 1280px)')
  const columns = !tiles && wide ? 3 : medium ? 2 : 1
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const ranked = useMemo(() => boxes.map((box) => {
    const rate = box.currency === state.settings.baseCurrency ? 1 : state.settings.rates[box.currency]
    const value = toBase(boxValueAt(state, box.id, date, planned), box.currency, state.settings)
    return { box, value, known: Number.isFinite(rate) && rate > 0 && Number.isFinite(value) }
  }).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)), [boxes, state, date, planned])
  // Unknown conversions stay visible; significant negative balances rank by magnitude.
  const comparable = ranked.filter((item) => item.known)
  const cutoff = collapsedBoxCount(comparable.map((item) => Math.abs(item.value)), columns)
  const hidden = comparable.slice(cutoff)
  const hiddenIds = new Set(hidden.map((item) => item.box.id))
  // Keep the user's order, including drag-and-drop ordering on the Boxes page.
  const visible = expanded ? boxes : boxes.filter((box) => !hiddenIds.has(box.id))
  const hiddenTotal = hidden.reduce((sum, item) => sum + item.value, 0)
  const total = comparable.reduce((sum, item) => sum + item.value, 0)
  const totalKnown = comparable.length === boxes.length

  return (
    <div>
      <div id={id}>{children(visible)}</div>
      {hidden.length > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 inline-flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-0 bg-transparent px-0 py-1 text-left text-sm text-muted shadow-none transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-clay"
        >
          <span className="flex flex-wrap items-center gap-2">
            {expanded ? <ChevronUp className="size-4 shrink-0" /> : <ChevronDown className="size-4 shrink-0" />}
            {expanded ? 'Show less' : (
              <>
                <span>Hidden (<Money amount={hiddenTotal} className="text-ink" />)</span>
                <span className="text-xs">{hidden.length} {hidden.length === 1 ? 'item' : 'items'}</span>
              </>
            )}
          </span>
          <span className="flex flex-wrap items-baseline gap-3">
            <span aria-hidden="true" className="text-faint">·</span>
            <span title="Total of shown and hidden items">
              Total ({totalKnown ? <Money amount={total} className="text-ink" /> : 'rate needed'})
            </span>
          </span>
        </button>
      )}
    </div>
  )
}
