import { RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { CURRENCIES, currencyMeta } from '@/domain'
import { fmtPercent } from '@/lib/format'
import { useActiveBoxes } from '@/store/selectors'
import { useStore } from '@/store/store'
import { Button, Card, ConfirmDialog, Field, Input, Select, Slider } from '@/ui'

const CURRENCY_OPTIONS = Object.values(CURRENCIES).map((c) => ({
  value: c.code,
  label: `${c.symbol}  ${c.code} · ${c.name}`,
}))

export default function SettingsPage() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const setRate = useStore((s) => s.setRate)
  const resetAll = useStore((s) => s.resetAll)
  const boxes = useActiveBoxes()
  const [confirmReset, setConfirmReset] = useState(false)

  const base = settings.baseCurrency
  const inflation = settings.inflation ?? 0

  const otherCurrencies = useMemo(() => {
    const set = new Set<string>([...Object.keys(settings.rates), ...boxes.map((b) => b.currency)])
    set.delete(base)
    return [...set]
  }, [settings.rates, boxes, base])

  const changeBase = (nb: string) => {
    const rateOf = (c: string) => (c === base ? 1 : (settings.rates[c] ?? 1))
    const denom = rateOf(nb) || 1
    const codes = new Set<string>([...Object.keys(settings.rates), base, nb, ...boxes.map((b) => b.currency)])
    const rates: Record<string, number> = {}
    for (const c of codes) rates[c] = rateOf(c) / denom
    rates[nb] = 1
    updateSettings({ baseCurrency: nb, rates })
  }

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Base currency, exchange rates, and your data." />

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-5 p-5 md:p-6">
          <Field label="Base currency" hint="Everything rolls up into this for your net worth.">
            <Select value={base} onValueChange={changeBase} options={CURRENCY_OPTIONS} aria-label="Base currency" className="max-w-xs" />
          </Field>

          <Field
            label={`Assumed inflation · ${fmtPercent(inflation)}`}
            hint="Used to show the real (purchasing-power) view on the planning page."
          >
            <div className="flex items-center gap-4">
              <Slider value={inflation} onValueChange={(v) => updateSettings({ inflation: v })} min={0} max={0.1} step={0.001} className="max-w-xs" />
              <span className="tabular text-sm text-muted">{fmtPercent(inflation)}</span>
            </div>
          </Field>
        </Card>

        <Card className="p-5 md:p-6">
          <h3 className="mb-1 font-serif text-lg text-ink">Exchange rates</h3>
          <p className="mb-4 text-sm text-muted">
            How much one unit is worth in {currencyMeta(base).name}.
          </p>
          {otherCurrencies.length === 0 ? (
            <p className="text-sm text-faint">Everything is already in {base}.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {otherCurrencies.map((c) => (
                <div key={c} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm text-muted">1 {c} =</span>
                  <Input
                    value={String(settings.rates[c] ?? '')}
                    onChange={(e) => {
                      const n = parseFloat(e.target.value)
                      if (!Number.isNaN(n)) setRate(c, n)
                    }}
                    inputMode="decimal"
                    className="h-10 tabular"
                  />
                  <span className="shrink-0 text-sm text-faint">{currencyMeta(base).symbol}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
          <div>
            <h3 className="font-serif text-lg text-ink">Demo data</h3>
            <p className="text-sm text-muted">Restore the original sample boxes and transactions.</p>
          </div>
          <Button variant="outline" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="size-4" />
            Reset to demo
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset everything?"
        description="This replaces all your boxes and transactions with the original demo data. This can't be undone."
        confirmLabel="Reset to demo"
        danger
        onConfirm={resetAll}
      />
    </Page>
  )
}
