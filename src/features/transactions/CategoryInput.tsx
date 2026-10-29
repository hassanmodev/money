import { useId, useState } from 'react'
import { useStore } from '@/store/store'
import { ActivityLedger } from '@/domain'
import { useFinanceState } from '@/store/selectors'
import { Input } from '@/ui'
import { CATEGORIES, categorySuggestions, normalizeCategory, validCategory } from './categories'

export function CategoryInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const transactions = useStore((s) => s.transactions)
  const state = useFinanceState()
  const id = useId()
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const known = [...CATEGORIES.map((c) => c.key), ...[...transactions, ...new ActivityLedger(state).current()].flatMap((t) => t.category ? [t.category] : [])]
  const suggestions = categorySuggestions(value, known)
  const normalized = normalizeCategory(value)
  const options = validCategory(value) && !suggestions.includes(normalized)
    ? [...suggestions, normalized] : suggestions
  const choose = (path: string, next = false) => {
    onChange(path + (next ? '.' : ''))
    setActive(-1)
    setOpen(next)
  }
  return (
    <div onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
      <Input aria-label="Category path" role="combobox" aria-autocomplete="list" aria-expanded={open && options.length > 0}
        aria-controls={open && options.length > 0 ? id : undefined} aria-activedescendant={open && options[active] ? `${id}-${active}` : undefined}
        value={value} autoComplete="off" placeholder="shopping.place:online.electronics.laptop"
        onFocus={() => setOpen(true)} onChange={(e) => { onChange(e.target.value); setActive(-1); setOpen(true) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); return }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true)
            setActive((index) => options.length ? (index < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length) : -1)
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            const path = open && active >= 0 ? options[active] : normalized
            if (path && validCategory(path)) choose(path)
          }
          if ((event.key === 'Tab' && !event.shiftKey && open) || (event.key === '.' && open && active >= 0)) {
            const path = active >= 0 ? options[active] : normalized
            if (path && validCategory(path)) { event.preventDefault(); choose(path, true) }
          }
        }} />
      {open && options.length > 0 && <div id={id} role="listbox" aria-label="Category suggestions" className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-line bg-sunken p-1">
        {options.map((path, index) => <button type="button" role="option" aria-selected={active === index} id={`${id}-${index}`} key={path}
          onMouseDown={(e) => e.preventDefault()} onClick={() => choose(path)}
          className={`block w-full break-words rounded-lg px-3 py-2 text-left text-xs ${active === index ? 'bg-clay/15 text-ink' : 'text-muted hover:bg-raised'}`}>
          {known.includes(path) || path !== normalized ? path : `Use “${path}”`}
        </button>)}
      </div>}
      <p className="mt-2 text-xs leading-relaxed text-faint">Use dots for levels and name:value for properties. ↑↓ to suggest, Tab to add a level, Enter to use or create a path.</p>
      {value && !validCategory(value) && <p className="mt-1 text-xs text-clay">Finish each level and give every property a name and value.</p>}
    </div>
  )
}
