import { Check, ChevronDown, Search } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { currencyMeta, searchCurrencies } from '@/domain'
import { cn } from '@/lib/cn'
import { useCurrencies } from '@/store/selectors'
import { Popover, PopoverContent, PopoverTrigger } from './Popover'

/**
 * A searchable currency selector. Closed, it reads like a `Select`; open, it's
 * a fuzzy-searchable list over the live catalogue (popular + EGP first). The
 * optional footer slot is used to hang a "create currency" affordance.
 */
export function CurrencyPicker({
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
  footer,
}: {
  value: string
  onChange: (code: string) => void
  className?: string
  'aria-label'?: string
  footer?: (query: string, close: () => void) => React.ReactNode
}) {
  const currencies = useCurrencies()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => searchCurrencies(query, currencies), [query, currencies])
  const meta = currencyMeta(value)

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const pick = (code: string) => {
    onChange(code)
    close()
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery('')
      }}
    >
      <PopoverTrigger
        aria-label={ariaLabel}
        className={cn(
          'flex h-11 items-center justify-between gap-2 rounded-xl border border-line bg-sunken/40 px-3.5',
          'text-sm text-ink outline-none transition-all duration-200',
          'hover:border-line-2 focus:border-clay/50 focus:ring-4 focus:ring-clay/10',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="w-5 shrink-0 text-center text-faint">{meta.symbol}</span>
          <span className="font-medium">{meta.code}</span>
          <span className="truncate text-muted">· {meta.name}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-faint" />
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0"
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search currencies…"
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ghost"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) pick(results[0].code)
            }}
          />
        </div>

        <div className="max-h-64 overflow-y-auto p-1">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-faint">No matches.</p>
          ) : (
            results.map((c) => {
              const active = c.code === value
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => pick(c.code)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                    active ? 'text-ink' : 'text-muted hover:bg-clay/10 hover:text-ink',
                  )}
                >
                  <span className="w-5 shrink-0 text-center text-faint">{c.symbol}</span>
                  <span className="w-10 shrink-0 font-medium">{c.code}</span>
                  <span className="truncate text-muted">{c.name}</span>
                  {active && <Check className="ml-auto size-4 shrink-0 text-clay" />}
                </button>
              )
            })
          )}
        </div>

        {footer && <div className="border-t border-line p-1">{footer(query, close)}</div>}
      </PopoverContent>
    </Popover>
  )
}
