import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { useState } from 'react'
import { currencyMeta, formatMoney, roundMoney, type Box } from '@/domain'
import { cn } from '@/lib/cn'
import { useBoxValue } from '@/store/selectors'
import { useStore } from '@/store/store'
import { useViewDate } from '@/store/time'
import { Button, Modal } from '@/ui'

/**
 * Set a box's balance to what the account actually holds. The difference
 * against the recorded value is booked as an adjustment entry (income or
 * expense), so history stays append-only instead of rewriting openingBalance.
 */
export function SetBalanceDialog({
  box,
  open,
  onOpenChange,
}: {
  box: Box
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const addTransaction = useStore((s) => s.addTransaction)
  const value = useBoxValue(box.id)
  const viewDate = useViewDate()
  const [targetStr, setTargetStr] = useState('')

  // Clear the input whenever the dialog closes so it reopens fresh.
  const handleOpenChange = (next: boolean) => {
    if (!next) setTargetStr('')
    onOpenChange(next)
  }

  const symbol = currencyMeta(box.currency).symbol
  const target = parseFloat(targetStr)
  const delta = Number.isFinite(target) ? roundMoney(target - value, box.currency) : 0
  const valid = Number.isFinite(target) && delta !== 0

  // Deposits run the box's acceptance curve / forwards cascade, so a positive
  // adjustment may not land in full when the box has spillover rules.
  const maySpill = delta > 0 && (box.forwards?.length || box.acceptance?.length)

  const save = () => {
    if (!valid) return
    addTransaction({
      kind: delta > 0 ? 'income' : 'expense',
      boxId: box.id,
      amount: Math.abs(delta),
      currency: box.currency,
      category: 'adjustment',
      note: `Balance adjustment: ${formatMoney(value, box.currency)} → ${formatMoney(target, box.currency)}`,
      date: viewDate,
    })
    handleOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={handleOpenChange}
      title={`Set balance — ${box.name}`}
      description={
        <>
          Recorded balance is{' '}
          <span className="font-medium text-ink">{formatMoney(value, box.currency)}</span>. Enter
          what the account actually holds and we'll book the difference as an adjustment entry.
        </>
      }
    >
      <div className="mt-5 flex items-center justify-center gap-1.5">
        <span className="font-serif text-2xl text-faint">{symbol}</span>
        <input
          value={targetStr}
          onChange={(e) => setTargetStr(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          inputMode="decimal"
          placeholder="0"
          autoFocus
          className="w-44 bg-transparent text-center font-serif text-4xl tabular text-ink outline-none placeholder:text-ghost"
        />
      </div>

      <div className="mt-3 flex h-5 items-center justify-center gap-1 text-sm">
        {valid && (
          <span
            className={cn(
              'flex items-center gap-1 tabular',
              delta > 0 ? 'text-sage' : 'text-clay',
            )}
          >
            {delta > 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {formatMoney(delta, box.currency, { sign: true })} adjustment
          </span>
        )}
      </div>

      {maySpill ? (
        <p className="mt-1 text-center text-xs text-faint">
          Heads up — this box routes overflow elsewhere, so part of a top-up may spill over.
        </p>
      ) : null}

      <div className="mt-5 flex justify-end gap-3">
        <Button variant="ghost" onClick={() => handleOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={save} disabled={!valid}>
          Book adjustment
        </Button>
      </div>
    </Modal>
  )
}
