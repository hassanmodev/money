import { useEffect, useState } from 'react'
import {
  currencyMeta,
  isDefaultCurrency,
  type CurrencyKind,
  type CurrencyMeta,
} from '@/domain'
import { useStore } from '@/store/store'
import { Button, Field, Input, Modal, Segmented } from '@/ui'

const KIND_OPTIONS: { value: CurrencyKind; label: string }[] = [
  { value: 'fiat', label: 'Fiat' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'metal', label: 'Metal' },
  { value: 'custom', label: 'Other' },
]

const blank: CurrencyMeta = { code: '', name: '', symbol: '', decimals: 2, kind: 'fiat' }

/**
 * Create or edit a single currency. Editing a built-in stores an override (its
 * code is locked); creating adds a brand-new custom currency.
 */
export function CurrencyForm({
  open,
  onOpenChange,
  editing,
  presetCode = '',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** the currency being edited, or undefined when creating */
  editing?: CurrencyMeta
  /** prefill the code when creating from a search query */
  presetCode?: string
}) {
  const upsertCurrency = useStore((s) => s.upsertCurrency)
  const [draft, setDraft] = useState<CurrencyMeta>(blank)

  useEffect(() => {
    if (!open) return
    setDraft(editing ?? { ...blank, code: presetCode.toUpperCase() })
  }, [open, editing, presetCode])

  const isEdit = !!editing
  const code = draft.code.trim().toUpperCase()
  const codeTaken = !isEdit && code.length > 0 && isDefaultCurrency(code)
  const valid = /^[A-Z0-9]{2,6}$/.test(code) && draft.name.trim().length > 0 && !codeTaken

  const set = <K extends keyof CurrencyMeta>(key: K, v: CurrencyMeta[K]) =>
    setDraft((d) => ({ ...d, [key]: v }))

  const save = () => {
    if (!valid) return
    upsertCurrency({
      code,
      name: draft.name.trim(),
      symbol: draft.symbol.trim() || code,
      decimals: Math.max(0, Math.min(8, Math.round(draft.decimals || 0))),
      kind: draft.kind,
      // preserve a built-in's "popular" placement when overriding it
      popular: isDefaultCurrency(code) ? currencyMeta(code).popular : undefined,
    })
    onOpenChange(false)
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `Edit ${editing.code}` : 'New currency'}
      className="max-w-md"
    >
      <div className="mt-5 flex flex-col gap-4">
        <div className="grid grid-cols-[1fr_1fr] gap-4">
          <Field label="Code" hint={codeTaken ? 'Already a built-in code.' : '2–6 letters/digits'}>
            <Input
              value={draft.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              disabled={isEdit}
              placeholder="EGP"
              maxLength={6}
              className="tabular uppercase disabled:opacity-60"
            />
          </Field>
          <Field label="Symbol">
            <Input
              value={draft.symbol}
              onChange={(e) => set('symbol', e.target.value)}
              placeholder="E£"
            />
          </Field>
        </div>

        <Field label="Name">
          <Input
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="Egyptian Pound"
          />
        </Field>

        <div className="grid grid-cols-[auto_1fr] items-end gap-4">
          <Field label="Decimals">
            <Input
              type="number"
              min={0}
              max={8}
              value={String(draft.decimals)}
              onChange={(e) => set('decimals', parseInt(e.target.value, 10) || 0)}
              className="w-20 tabular"
            />
          </Field>
          <Field label="Kind">
            <Segmented
              value={draft.kind}
              onChange={(k) => set('kind', k)}
              options={KIND_OPTIONS}
              size="sm"
              className="w-full [&>button]:flex-1"
            />
          </Field>
        </div>

        <div className="mt-2 flex justify-end gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!valid}>
            {isEdit ? 'Save changes' : 'Add currency'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
