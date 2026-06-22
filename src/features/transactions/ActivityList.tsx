import { MoreHorizontal, Pencil, Repeat, Sparkles, Target, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { cadenceLabel, formatMoney, type Goal, type Transaction } from '@/domain'
import { cn } from '@/lib/cn'
import { fmtDateShort, relativeDay } from '@/lib/date'
import { useStore } from '@/store/store'
import { Button, Chip, Menu, MenuItem } from '@/ui'
import { categoryOf } from './categories'
import { useComposer } from './ComposerProvider'

const KIND_COLOR: Record<Transaction['kind'], string> = {
  expense: 'text-rust',
  income: 'text-sage',
  transfer: 'text-muted',
}

function TransactionRow({ tx }: { tx: Transaction }) {
  const boxes = useStore((s) => s.boxes)
  const removeTransaction = useStore((s) => s.removeTransaction)
  const composer = useComposer()
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
    <div
      role="button"
      tabIndex={0}
      onClick={() => composer.edit(tx)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          composer.edit(tx)
        }
      }}
      className="group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-raised/50"
    >
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
            onClick={(e) => e.stopPropagation()}
            className="size-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        }
      >
        <MenuItem icon={Pencil} onSelect={() => composer.edit(tx)}>
          Edit
        </MenuItem>
        <MenuItem icon={Trash2} danger onSelect={() => removeTransaction(tx.id)}>
          Delete
        </MenuItem>
      </Menu>
    </div>
  )
}

/**
 * An achieved goal, shown as a synthetic deduction in the feed. It's derived
 * from the goal's status — never a persisted transaction — because the
 * projection already subtracts the cost via `goalOutflows`; a real transaction
 * would double-count against net worth and the planner. Read-only: clicking
 * opens the goal itself rather than a fake transaction editor.
 */
function GoalRow({ goal, baseCurrency }: { goal: Goal; baseCurrency: string }) {
  const navigate = useNavigate()
  const open = () => navigate(`/goals?edit=${goal.id}`)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      className="group flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-raised/50"
    >
      <div
        className="grid size-9 shrink-0 place-items-center rounded-xl"
        style={{ backgroundColor: `${goal.color}1f`, color: goal.color }}
      >
        <Sparkles className="size-[18px]" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm text-ink">{goal.name}</span>
          <Chip className="gap-1 px-2 py-0.5 text-[10px]">
            <Target className="size-2.5" />
            Goal
          </Chip>
        </div>
        <div className="truncate text-xs text-faint">Goal achieved</div>
      </div>

      <div className="text-right">
        <div className="text-sm font-medium tabular text-rust">−{formatMoney(goal.cost, baseCurrency)}</div>
        <div className="text-[11px] text-faint">{fmtDateShort(goal.doneDate!)}</div>
      </div>
    </div>
  )
}

/** A feed entry: a real transaction, or a synthetic achieved-goal deduction. */
type FeedItem =
  | { kind: 'tx'; date: string; tx: Transaction }
  | { kind: 'goal'; date: string; goal: Goal }

export function ActivityList({ limit, boxId }: { limit?: number; boxId?: string }) {
  const transactions = useStore((s) => s.transactions)
  const goals = useStore((s) => s.goals)
  const baseCurrency = useStore((s) => s.settings.baseCurrency)

  const groups = useMemo(() => {
    const items: FeedItem[] = transactions
      .filter((t) => !boxId || t.boxId === boxId || t.toBoxId === boxId)
      .map((tx) => ({ kind: 'tx', date: tx.date, tx }))
    // Achieved goals draw from the shared funding pool, not a single box, so
    // they only make sense in the unfiltered feed — a per-box history shows the
    // box's real balance change, not a pool-wide goal line.
    if (!boxId) {
      for (const g of goals) {
        if (g.status === 'done' && g.doneDate) items.push({ kind: 'goal', date: g.doneDate, goal: g })
      }
    }
    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    const limited = limit ? items.slice(0, limit) : items
    const out: { day: string; items: FeedItem[] }[] = []
    for (const it of limited) {
      const day = relativeDay(it.date)
      const last = out.at(-1)
      if (last && last.day === day) last.items.push(it)
      else out.push({ day, items: [it] })
    }
    return out
  }, [transactions, goals, limit, boxId])

  if (groups.length === 0) {
    return <p className="px-2.5 py-8 text-center text-sm text-faint">Nothing here yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.day}>
          <div className="mb-1 px-2.5 text-[11px] uppercase tracking-[0.1em] text-faint">{g.day}</div>
          <div className="flex flex-col">
            {g.items.map((it) =>
              it.kind === 'tx' ? (
                <TransactionRow key={it.tx.id} tx={it.tx} />
              ) : (
                <GoalRow key={`goal-${it.goal.id}`} goal={it.goal} baseCurrency={baseCurrency} />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
