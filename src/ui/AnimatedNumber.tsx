import { animate } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

/** A number that springs smoothly to its target whenever `value` changes. */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toString(),
  duration = 0.9,
  className,
}: {
  value: number
  format?: (n: number) => string
  duration?: number
  className?: string
}) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(v),
    })
    prev.current = value
    return () => controls.stop()
  }, [value, duration])

  return <span className={cn('tabular', className)}>{format(display)}</span>
}
