/**
 * Bulk add — create many sub-projects under a parent from a compact text
 * format. Import-style, one-shot: parse → live preview → create. The parser
 * lives in `domain/time/bulk`; this sheet is only input, preview, and a loop
 * over `addProject`.
 */
import { useMemo, useState } from 'react'
import { codeLeaf, parseBulkCreate, type BulkCreate as BulkSpec } from '@/domain/time'
import { cn } from '@/lib/cn'
import { useTimeStore } from '@/store/timeProjects'
import { Button, Field, Select, Sheet, Textarea } from '@/ui'
import { fmtDur } from './format'

const PLACEHOLDER = `# code Name: item, item Name "note", …
fun-phone Phone: soc Social "x,fb", chess, vid Video "youtube,tiktok"
fun-watch Watch: mov, ser 30m/w, "video games"`

const PERIOD_LABEL = { day: '/day', week: '/week', month: '/month', custom: '' } as const

const describeSpec = (s: BulkSpec): string => {
  if (s.budget) return `${fmtDur(s.budget.min)}${PERIOD_LABEL[s.budget.period.kind]}`
  if (s.fr) return `${s.fr.share}fr`
  return 'group'
}

export function BulkCreate({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const projects = useTimeStore((s) => s.projects)
  const addProject = useTimeStore((s) => s.addProject)
  const [parentId, setParentId] = useState('none')
  const [text, setText] = useState('')

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setParentId('none')
      setText('')
    }
  }

  const parent = projects.find((p) => p.id === parentId) ?? null
  const coded = projects.filter((p) => p.code && !p.archived)
  const plan = useMemo(() => parseBulkCreate(text, parent, projects), [text, parent, projects])

  const create = () => {
    for (const spec of plan.creates) {
      addProject({
        name: spec.name,
        code: spec.code,
        note: spec.note,
        budget: spec.budget,
        fr: spec.fr,
        effects: [],
        requires: [],
      })
    }
    onOpenChange(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Bulk add projects"
      description="Create many subs at once — codes keep the parent's prefix."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create} disabled={plan.creates.length === 0}>
            Create {plan.creates.length || ''} project{plan.creates.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Parent" hint="Everything created keeps this code as prefix.">
          <Select
            value={parentId}
            onValueChange={setParentId}
            options={[
              { value: 'none', label: 'No parent (top level)' },
              ...coded.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` })),
            ]}
          />
        </Field>

        <Field
          label="Projects"
          hint={
            'Each line is `code Name: item, item, …` — items become sub-projects of that code. First word is always the code (dashes nest deeper), the rest is its display name: `soc Social`. Want a spaced name with no code of your own? Quote it — `"video games"` → video-games. A quote after a code is its note instead — commas inside are safe. Amounts are `1h` or `30m`, per day unless /w or /mo; a leading amount sets the line default, bare items get 1fr of the parent\'s share. Missing groups are created, existing codes skipped, `#` starts a comment.'
          }
        >
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={8}
            autoFocus
            className="font-mono text-[13px]"
          />
        </Field>

        {(plan.creates.length > 0 || plan.skips.length > 0 || plan.errors.length > 0) && (
          <div className="flex flex-col gap-1 rounded-2xl border border-line p-3">
            {plan.creates.map((s) => (
              <div key={s.code} className="flex items-baseline gap-2 text-sm">
                <span className={cn('min-w-0 flex-1 truncate', s.group ? 'text-faint' : 'text-ink')}>
                  {s.name !== codeLeaf(s.code) ? `${s.name} · ` : ''}
                  <span className="text-faint">{s.code}</span>
                  {s.note ? <span className="text-faint"> · “{s.note}”</span> : null}
                </span>
                <span className="shrink-0 tabular text-xs text-faint">{describeSpec(s)}</span>
              </div>
            ))}
            {plan.skips.map((s, i) => (
              <div key={`skip-${i}`} className="flex items-baseline gap-2 text-sm opacity-50">
                <span className="min-w-0 flex-1 truncate text-muted line-through">{s.code}</span>
                <span className="shrink-0 text-xs text-faint">{s.reason}</span>
              </div>
            ))}
            {plan.errors.map((e, i) => (
              <div key={`err-${i}`} className="text-xs text-rust">
                line {e.line}: {e.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}
