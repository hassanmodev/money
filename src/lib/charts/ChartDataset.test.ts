import { describe, expect, it } from 'vitest'
import { ChartDataset, PieChartModel, type ChartPoint } from './ChartDataset'

describe('reusable chart data', () => {
  it('groups arbitrary records without losing their source values', () => {
    const rows = [{ kind: 'work', hours: 3 }, { kind: 'rest', hours: 2 }, { kind: 'work', hours: 4 }]
    const groups = new ChartDataset(rows).groupBy((row) => row.kind)
    expect(groups.map(({ key, data }) => ({ key, total: data.sum((row) => row.hours) })))
      .toEqual([{ key: 'work', total: 7 }, { key: 'rest', total: 2 }])
    expect(rows).toHaveLength(3)
  })

  it('uses positive shares while preserving debt, zero, and unavailable entries', () => {
    const points: ChartPoint[] = [60, 40, -30, 0, NaN, Infinity].map((value, index) => ({
      id: String(index), label: String(index), value, color: '#fff',
    }))
    const model = new PieChartModel(points)
    expect(model.total).toBe(100)
    expect(model.slices).toHaveLength(2)
    expect(model.points.map((point) => model.share(point))).toEqual([0.6, 0.4, 0, 0, 0, 0])
    expect(model.points[2].value).toBe(-30)
    expect(model.points[4].value).toBeNull()
    expect(points[4].value).toBeNaN()
  })

  it('handles empty and non-positive datasets without invalid shares', () => {
    expect(new PieChartModel([]).total).toBe(0)
    const point = { id: 'debt', label: 'Debt', value: -100, color: '#fff' }
    const model = new PieChartModel([point])
    expect(model.slices).toEqual([])
    expect(model.share(point)).toBe(0)
  })
})
