import { MoreHorizontal, Repeat, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { cadenceLabel, formatMoney, type Transaction } from '@/domain'
import { cn } from '@/lib/cn'
import { fmtDateShort, relativeDay } from '@/lib/date'
import { useStore } from '@/store/store'
import { Button, Chip, Menu, MenuItem } from '@/ui'
import { categoryOf } from './categories'

const KIND_COLOR: Record<Transaction['kind'], string> = {
  expense: 'text-rust',
  income: 'text-sage',
  transfer: 'text-muted',
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const boxes = useStore((s) => s.boxes)
  const removeTransaction = useStore((s) => s.removeTransaction)
  const cat = categoryOf(tx.category)
  const Icon = cat.icon
  const fromBox = boxes.find((b) => b.id === tx.boxId)
  const toBox = boxes.find((b) => b.id === tx.toBoxId)

  const sign = tx.kind === 'expense' ? '−' : tx.kind === 'income' ? '+' : '→'
  const subtitle =
    tx.kind === 'transfer'
      ? `${fromBox?.name ?? '—'} → ${toBox?.name ?? '—'}`
      : `${fromBox?.name ?? '—'} · ${cat.label}`

  return (
    <div className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-raised/50">
      <div
        className="grid size-9 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `${cat.color}1f`, color: cat.color }}
      >
        <Icon className="size-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-ink">{tx.note || cat.label}</span>
          {tx.recurrence && (
            <Chip className="gap-1 px-2 py-0.5 text-[10px]">
              <Repeat className="size-2.5" />
              {cadenceLabel(tx.recurrence)}
            </Chip>
          )}
        </div>
        <div className="truncate text-xs text-faint">{subtitle}</div>
      </div>

      <div className="text-right">
        <div className={cn('text-sm font-medium tabular', KIND_COLOR[tx.kind])}>
          {sign}
          {formatMoney(tx.amount, tx.currency)}
        </div>
        <div className="text-[11px] text-faint">{fmtDateShort(tx.date)}</div>
      </div>

      <Menu
        trigger={
          <Button
            size="icon"
            variant="ghost"
            aria-label="Transaction options"
            className="size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={Trash2} danger onSelect={() => removeTransaction(tx.id)}>
          Delete
        </MenuItem>
      </Menu>
    </div>
  )
}

export function ActivityList({ limit, boxId }: { limit?: number; boxId?: string }) {
  const transactions = useStore((s) => s.transactions)

  const groups = useMemo(() => {
    const filtered = transactions
      .filter((t) => !boxId || t.boxId === boxId || t.toBoxId === boxId)
      .slice()
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    const limited = limit ? filtered.slice(0, limit) : filtered
    const out: { day: string; items: Transaction[] }[] = []
    for (const tx of limited) {
      const day = relativeDay(tx.date)
      const last = out.at(-1)
      if (last && last.day === day) last.items.push(tx)
      else out.push({ day, items: [tx] })
    }
    return out
  }, [transactions, limit, boxId])

  if (groups.length === 0) {
    return <p className="px-2.5 py-8 text-center text-sm text-faint">Nothing here yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.day}>
          <div className="mb-1 px-2.5 text-[11px] uppercase tracking-[0.1em] text-faint">{g.day}</div>
          <div className="flex flex-col">
            {g.items.map((tx) => (
              <TransactionRow key={tx.id} tx={tx} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
