import * as SliderPrimitive from '@radix-ui/react-slider'
import { cn } from '@/lib/cn'

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className,
  'aria-label': ariaLabel,
}: {
  value: number
  onValueChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
  'aria-label'?: string
}) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex h-5 w-full touch-none select-none items-center', className)}
      value={[value]}
      onValueChange={(v) => onValueChange(v[0])}
      min={min}
      max={max}
      step={step}
    >
      <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-line">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-clay" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        aria-label={ariaLabel}
        className="block size-4 rounded-full bg-ink shadow-soft ring-2 ring-clay transition-shadow hover:ring-honey focus:outline-none focus:ring-4 focus:ring-clay/40"
      />
    </SliderPrimitive.Root>
  )
}
