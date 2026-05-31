import { extent } from 'd3-array'
import { scaleLinear } from 'd3-scale'
import { area as d3area, curveBasis, line as d3line } from 'd3-shape'
import { useId } from 'react'
import { hexToRgba } from '@/lib/palette'

export function Sparkline({
  data,
  color = '#d4845c',
  width = 120,
  height = 36,
  fill = true,
  strokeWidth = 1.75,
  className,
}: {
  data: number[]
  color?: string
  width?: number
  height?: number
  fill?: boolean
  strokeWidth?: number
  className?: string
}) {
  const id = useId().replace(/:/g, '')
  if (data.length < 2) return <svg width={width} height={height} className={className} />

  const x = scaleLinear().domain([0, data.length - 1]).range([1, width - 1])
  const [lo, hi] = extent(data) as [number, number]
  const pad = (hi - lo) * 0.14 || Math.abs(hi) * 0.1 || 1
  const y = scaleLinear().domain([lo - pad, hi + pad]).range([height - 1.5, 1.5])

  const lineGen = d3line<number>()
    .x((_d, i) => x(i))
    .y((d) => y(d))
    .curve(curveBasis)
  const areaGen = d3area<number>()
    .x((_d, i) => x(i))
    .y0(height)
    .y1((d) => y(d))
    .curve(curveBasis)

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={hexToRgba(color, 0.32)} />
          <stop offset="100%" stopColor={hexToRgba(color, 0)} />
        </linearGradient>
      </defs>
      {fill && <path d={areaGen(data) ?? ''} fill={`url(#spark-${id})`} />}
      <path
        d={lineGen(data) ?? ''}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
