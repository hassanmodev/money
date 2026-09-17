# Reusing the charts

`ChartDataset<T>` (`src/lib/charts/ChartDataset.ts`) prepares arbitrary records
with `map`, `groupBy`, and `sum`. It has no React or finance dependencies.
`ChartPoint` is the common renderer input: a stable `id`, `label`, numeric `value`
(or `null` for unavailable data), `color`, and optional `detail`.

`PieChartModel` calculates positive slices and shares without erasing signed
values from the legend. Future bar or line models can consume the same points
without adopting the pie's positive-only rule.

`DistributionChart` (`src/ui/charts/DistributionChart.tsx`) renders the pie and
its keyboard-focusable legend. It accepts any value formatter. `innerRadius={0}`
makes a full pie; the default is a doughnut. Hover a slice or focus a legend row
to highlight it.

```tsx
const hours = new ChartDataset(entries)
  .groupBy((entry) => entry.project)
  .map(({ key, data }, index) => ({
    id: key,
    label: key,
    value: data.sum((entry) => entry.hours),
    color: palette[index % palette.length],
  }))

<DistributionChart
  label="Hours by project"
  points={hours}
  formatValue={(value) => `${value} h`}
  innerRadius={0}
/>
```

The Boxes page uses `buildBoxCharts` as its finance adapter. It evaluates active
accounts at the selected date with the same planned purchases as account cards.
Account pies use native currencies; the currency mix converts positive account
balances to the base currency using saved rates. Negative amounts stay in the
account lists and net totals, but have no pie area. Missing/invalid exchange
rates produce unavailable currency points, never an assumed 1:1 conversion.
Empty and zero-only datasets show an empty ring and explanatory text.
