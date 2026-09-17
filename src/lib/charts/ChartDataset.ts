export interface ChartPoint {
  id: string
  label: string
  /** null means unavailable, rather than zero. */
  value: number | null
  color: string
  detail?: string
}

export interface ChartGroup<T> {
  key: string
  data: ChartDataset<T>
}

/** Framework-free data preparation shared by pie, bar, or future renderers. */
export class ChartDataset<T> {
  readonly rows: readonly T[]

  constructor(rows: readonly T[]) {
    this.rows = [...rows]
  }

  map<U>(project: (row: T, index: number) => U): ChartDataset<U> {
    return new ChartDataset(this.rows.map(project))
  }

  groupBy(keyOf: (row: T) => string): ChartGroup<T>[] {
    const groups = new Map<string, T[]>()
    for (const row of this.rows) {
      const key = keyOf(row)
      const group = groups.get(key) ?? []
      group.push(row)
      groups.set(key, group)
    }
    return [...groups].map(([key, rows]) => ({ key, data: new ChartDataset(rows) }))
  }

  sum(valueOf: (row: T) => number): number {
    return this.rows.reduce((total, row) => total + valueOf(row), 0)
  }
}

/** Pie-specific semantics live here; signed source values remain intact. */
export class PieChartModel {
  readonly points: readonly ChartPoint[]
  readonly total: number

  constructor(points: readonly ChartPoint[]) {
    this.points = points.map((point) => ({
      ...point,
      value: point.value !== null && Number.isFinite(point.value) ? point.value : null,
    }))
    this.total = this.points.reduce((sum, point) => sum + Math.max(0, point.value ?? 0), 0)
  }

  get slices(): readonly ChartPoint[] {
    return this.points.filter((point) => point.value !== null && point.value > 0)
  }

  share(point: ChartPoint): number {
    return this.total > 0 ? Math.max(0, point.value ?? 0) / this.total : 0
  }
}
