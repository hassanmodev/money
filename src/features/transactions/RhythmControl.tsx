import { Calendar, Infinity as InfinityIcon, Minus, Plus, Repeat, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import {
  nextOccurrences,
  occurrencesPerYear,
  type Recurrence,
  type RecurrenceEnd,
  type RecurrenceUnit,
} from '@/domain'
import { cn } from '@/lib/cn'
import { addYearsISO, fmtDateShort } from '@/lib/date'
import {
  Input,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Switch,
} from '@/ui'

const spring = { type: 'spring' as const, stiffness: 420, damping: 32 }
const UNITS: RecurrenceUnit[] = ['day', 'week', 'month', 'year']

function TokenButton({ children }: { children: React.ReactNode }) {
  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        className="rounded-md px-1.5 py-0.5 font-semibold text-clay underline decoration-clay/30 decoration-dotted underline-offset-4 transition-colors hover:bg-clay/10"
      >
        {children}
      </button>
    </PopoverTrigger>
  )
}

function Stepper({
  value,
  onChange,
  min = 1,
  max = 365,
}: {
  value: number
  onChange: (n: number) => void
  min?: number
  max?: number
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid size-9 place-items-center rounded-xl border border-line text-muted transition-colors hover:border-clay/50 hover:text-clay"
      >
        <Minus className="size-4" />
      </button>
      <span className="w-12 text-center font-serif text-2xl tabular text-ink">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        className="grid size-9 place-items-center rounded-xl border border-line text-muted transition-colors hover:border-clay/50 hover:text-clay"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

/** The living tempo: a highlight travels across the beads, faster the more often it repeats. */
function RhythmRibbon({ rec }: { rec: Recurrence }) {
  const beads = 9
  const perYear = occurrencesPerYear(rec)
  const tempo = useMemo(() => {
    const f = Math.log(perYear + 1) / Math.log(366) // 0 (yearly) .. 1 (daily)
    return 840 - f * 640
  }, [perYear])

  const reduce = useReducedMotion()
  const [active, setActive] = useState(0)
  useEffect(() => {
    if (reduce) return
    const id = setInterval(() => setActive((a) => (a + 1) % beads), tempo)
    return () => clearInterval(id)
  }, [tempo, reduce])

  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: beads }).map((_, i) => {
        const dist = Math.abs(i - active)
        const on = dist === 0
        return (
          <motion.span
            key={i}
            className="h-2 flex-1 rounded-full"
            style={{ originY: 0.5 }}
            animate={{
              backgroundColor: on
                ? 'var(--color-clay)'
                : dist === 1
                  ? 'rgba(212,132,92,0.4)'
                  : 'var(--color-line)',
              scaleY: on ? 1.9 : 1,
            }}
            transition={{ duration: 0.25 }}
          />
        )
      })}
    </div>
  )
}

function OccurrencePreview({ rec }: { rec: Recurrence }) {
  const dates = nextOccurrences(rec, 6, rec.anchor)
  return (
    <div className="flex min-h-[26px] flex-wrap gap-1.5">
      <AnimatePresence mode="popLayout" initial={false}>
        {dates.map((d) => (
          <motion.span
            key={d}
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={spring}
            className="rounded-full border border-line bg-sunken/40 px-2.5 py-1 text-xs tabular text-muted"
          >
            {fmtDateShort(d)}
          </motion.span>
        ))}
      </AnimatePresence>
      {dates.length === 0 && <span className="text-xs text-faint">No upcoming dates</span>}
    </div>
  )
}

function EndPopover({
  end,
  anchor,
  onChange,
}: {
  end: RecurrenceEnd
  anchor: string
  onChange: (end: RecurrenceEnd) => void
}) {
  const label =
    end.type === 'never'
      ? 'forever'
      : end.type === 'on'
        ? `until ${fmtDateShort(end.date)}`
        : `${end.count}×`

  const Opt = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors',
        active ? 'bg-clay/15 text-ink' : 'text-muted hover:bg-raised',
      )}
    >
      {children}
    </button>
  )

  return (
    <Popover>
      <TokenButton>{label}</TokenButton>
      <PopoverContent align="start" className="w-60">
        <div className="flex flex-col gap-1">
          <Opt active={end.type === 'never'} onClick={() => onChange({ type: 'never' })}>
            Forever
          </Opt>
          <Opt
            active={end.type === 'on'}
            onClick={() => onChange({ type: 'on', date: end.type === 'on' ? end.date : addYearsISO(anchor, 1) })}
          >
            Until a date
          </Opt>
          <Opt
            active={end.type === 'after'}
            onClick={() => onChange({ type: 'after', count: end.type === 'after' ? end.count : 12 })}
          >
            After a number of times
          </Opt>

          {end.type === 'on' && (
            <Input
              type="date"
              value={end.date}
              min={anchor}
              onChange={(e) => onChange({ type: 'on', date: e.target.value })}
              className="mt-1.5 h-10 [color-scheme:dark]"
            />
          )}
          {end.type === 'after' && (
            <div className="mt-2 flex justify-center">
              <Stepper value={end.count} onChange={(n) => onChange({ type: 'after', count: n })} min={1} max={999} />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The non-checkbox recurring control. Collapsed it's a quiet "one-time" card;
 * activated it becomes an editable sentence with a pulsing cadence ribbon and a
 * live preview of the next dates.
 */
export function RhythmControl({
  value,
  onChange,
  anchor,
}: {
  value: Recurrence | null
  onChange: (rec: Recurrence | null) => void
  anchor: string
}) {
  if (!value) {
    return (
      <button
        type="button"
        onClick={() => onChange({ every: 1, unit: 'month', anchor, end: { type: 'never' } })}
        className="group flex w-full items-center justify-between rounded-2xl border border-line bg-sunken/30 px-4 py-3 text-left transition-colors hover:border-clay/40"
      >
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-raised text-faint transition-colors group-hover:text-clay">
            <Repeat className="size-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-ink">One-time</div>
            <div className="text-xs text-faint">Happens once, on this date</div>
          </div>
        </div>
        <span className="text-xs font-medium text-clay opacity-0 transition-opacity group-hover:opacity-100">
          Make it repeat →
        </span>
      </button>
    )
  }

  const rec = value
  const set = (patch: Partial<Recurrence>) => onChange({ ...rec, ...patch })
  const unitWord = `${rec.unit}${rec.every > 1 ? 's' : ''}`

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="rounded-2xl border border-clay/30 bg-clay/[0.06] p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-0.5 gap-y-1.5 text-sm text-muted">
          <span>Repeats every</span>

          <Popover>
            <TokenButton>{rec.every}</TokenButton>
            <PopoverContent className="w-auto">
              <Stepper value={rec.every} onChange={(n) => set({ every: n })} min={1} max={365} />
            </PopoverContent>
          </Popover>

          <Popover>
            <TokenButton>{unitWord}</TokenButton>
            <PopoverContent align="start" className="w-40">
              <div className="flex flex-col gap-0.5">
                {UNITS.map((u) => (
                  <PopoverClose key={u} asChild>
                    <button
                      type="button"
                      onClick={() =>
                        set({
                          unit: u,
                          dailyAccrual: u === 'day' ? undefined : rec.dailyAccrual,
                        })
                      }
                      className={cn(
                        'rounded-lg px-2.5 py-1.5 text-left text-sm capitalize transition-colors',
                        u === rec.unit ? 'bg-clay/15 text-ink' : 'text-muted hover:bg-raised',
                      )}
                    >
                      {u}
                    </button>
                  </PopoverClose>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <span>·</span>
          <EndPopover end={rec.end} anchor={anchor} onChange={(end) => set({ end })} />
        </div>

        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Stop repeating"
          className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-raised hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="mt-4">
        <RhythmRibbon rec={rec} />
      </div>

      {rec.unit !== 'day' && (
        <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-line/70 bg-sunken/30 px-3 py-2.5">
          <div>
            <div className="text-sm font-medium text-ink">Accrue daily</div>
            <div className="text-xs text-faint">
              Spread each period's amount evenly across its calendar days
            </div>
          </div>
          <Switch
            checked={rec.dailyAccrual ?? false}
            onCheckedChange={(dailyAccrual) => set({ dailyAccrual })}
            aria-label="Accrue recurring amount daily"
          />
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] uppercase tracking-[0.1em] text-faint">
          {rec.end.type === 'never' ? <InfinityIcon className="size-3.5" /> : <Calendar className="size-3.5" />}
          Next dates
        </div>
        <OccurrencePreview rec={rec} />
      </div>
    </motion.div>
  )
}
