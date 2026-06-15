import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { currencyMeta, isDefaultCurrency, type CurrencyMeta } from '@/domain'
import { useStore } from '@/store/store'
import { Button, Card, CurrencyPicker } from '@/ui'
import { CurrencyForm } from './CurrencyForm'

/**
 * Currency CRUD: add custom currencies, edit any currency (built-ins are stored
 * as overrides), and revert/remove. The picker doubles as "edit existing" — pick
 * one to edit it, or use its search-aware footer to create a new one.
 */
export function CurrencyManager() {
  const custom = useStore((s) => s.settings.customCurrencies) ?? []
  const removeCurrency = useStore((s) => s.removeCurrency)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CurrencyMeta | undefined>()
  const [presetCode, setPresetCode] = useState('')

  const openCreate = (code = '') => {
    setEditing(undefined)
    setPresetCode(code)
    setFormOpen(true)
  }
  const openEdit = (code: string) => {
    setEditing(currencyMeta(code))
    setPresetCode('')
    setFormOpen(true)
  }

  return (
    <Card className="flex flex-col gap-4 p-5 md:p-6">
      <div>
        <h3 className="font-serif text-lg text-ink">Currencies</h3>
        <p className="text-sm text-muted">
          Add your own, or tweak a built-in's symbol, name, or decimals.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <CurrencyPicker
            value=""
            onChange={openEdit}
            aria-label="Edit a currency"
            footer={(query, close) => (
              <button
                type="button"
                onClick={() => {
                  close()
                  openCreate(query)
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-clay transition-colors hover:bg-clay/10"
              >
                <Plus className="size-4" />
                Create new currency{query.trim() ? ` "${query.trim().toUpperCase()}"` : ''}
              </button>
            )}
          />
        </div>
        <Button variant="outline" onClick={() => openCreate()}>
          <Plus className="size-4" />
          Add
        </Button>
      </div>

      {custom.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-faint">Your edits</p>
          {custom.map((c) => {
            const override = isDefaultCurrency(c.code)
            return (
              <div
                key={c.code}
                className="flex items-center gap-3 rounded-xl border border-line bg-sunken/30 px-3 py-2"
              >
                <span className="w-5 shrink-0 text-center text-faint">{c.symbol}</span>
                <span className="w-12 shrink-0 font-medium text-ink">{c.code}</span>
                <span className="truncate text-sm text-muted">{c.name}</span>
                <span className="ml-auto shrink-0 text-xs text-faint">
                  {override ? 'override' : 'custom'} · {c.decimals}d
                </span>
                <button
                  type="button"
                  aria-label={`Edit ${c.code}`}
                  onClick={() => openEdit(c.code)}
                  className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-clay/10 hover:text-ink"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label={override ? `Reset ${c.code}` : `Delete ${c.code}`}
                  onClick={() => removeCurrency(c.code)}
                  className="shrink-0 rounded-lg p-1.5 text-faint transition-colors hover:bg-rust/10 hover:text-rust"
                >
                  {override ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />}
                </button>
              </div>
            )
          })}
        </div>
      )}

      <CurrencyForm
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        presetCode={presetCode}
      />
    </Card>
  )
}
