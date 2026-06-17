import { RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Page } from '@/components/Page'
import { PageHeader } from '@/components/PageHeader'
import { currencyMeta, marketRates } from '@/domain'
import { fmtPercent } from '@/lib/format'
import { useActiveBoxes } from '@/store/selectors'
import { useStore } from '@/store/store'
import { Button, Card, ConfirmDialog, CurrencyPicker, Field, Input, Slider } from '@/ui'
import { CurrencyManager } from './CurrencyManager'

export default function SettingsPage() {
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const setRate = useStore((s) => s.setRate)
  const resetAll = useStore((s) => s.resetAll)
  const clearAll = useStore((s) => s.clearAll)
  const boxes = useActiveBoxes()
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const base = settings.baseCurrency
  const inflation = settings.inflation ?? 0

  const otherCurrencies = useMemo(() => {
    const set = new Set<string>([...Object.keys(settings.rates), ...boxes.map((b) => b.currency)])
    set.delete(base)
    return [...set]
  }, [settings.rates, boxes, base])

  // Switching base re-pulls every rate from the bundled market data
  // (rates_usd.json) against the new base. Codes the table doesn't cover are
  // rebased arithmetically off their old value so they aren't lost.
  const ratesFor = (nb: string): Record<string, number> => {
    const rateOf = (c: string) => (c === base ? 1 : (settings.rates[c] ?? 1))
    const denom = rateOf(nb) || 1
    const codes = new Set<string>([...Object.keys(settings.rates), base, nb, ...boxes.map((b) => b.currency)])
    const rebased: Record<string, number> = {}
    for (const c of codes) rebased[c] = rateOf(c) / denom
    return marketRates(nb, codes, rebased)
  }

  const changeBase = (nb: string) => {
    updateSettings({ baseCurrency: nb, rates: ratesFor(nb) })
  }

  // Refresh every non-base rate from the market data without changing base.
  const fillFromMarket = () => {
    updateSettings({ rates: ratesFor(base) })
  }

  return (
    <Page>
      <PageHeader title="Settings" subtitle="Base currency, exchange rates, and your data." />

      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-5 p-5 md:p-6">
          <Field label="Base currency" hint="Everything rolls up into this for your net worth.">
            <CurrencyPicker value={base} onChange={changeBase} aria-label="Base currency" className="max-w-xs" />
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
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="mb-1 font-serif text-lg text-ink">Exchange rates</h3>
              <p className="text-sm text-muted">
                How much one unit is worth in {currencyMeta(base).name}.
              </p>
            </div>
            {otherCurrencies.length > 0 && (
              <Button variant="outline" onClick={fillFromMarket} className="shrink-0">
                <RefreshCw className="size-4" />
                Use market rates
              </Button>
            )}
          </div>
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

        <CurrencyManager />

        <Card className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
          <div>
            <h3 className="font-serif text-lg text-ink">Your data</h3>
            <p className="text-sm text-muted">Clear everything or restore the original sample boxes and transactions.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="danger" onClick={() => setConfirmClear(true)}>
              <Trash2 className="size-4" />
              Clear all
            </Button>
            <Button variant="outline" onClick={() => setConfirmReset(true)}>
              <RotateCcw className="size-4" />
              Reset to demo
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear everything?"
        description="This removes all boxes, transactions, and custom currencies, and resets settings to defaults. This can't be undone."
        confirmLabel="Clear all"
        danger
        onConfirm={clearAll}
      />

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset to demo?"
        description="This replaces all your boxes and transactions with the original demo data. This can't be undone."
        confirmLabel="Reset to demo"
        danger
        onConfirm={resetAll}
      />
    </Page>
  )
}
