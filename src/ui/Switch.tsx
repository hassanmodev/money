import * as SwitchPrimitive from '@radix-ui/react-switch'
import { cn } from '@/lib/cn'

export function Switch({
  checked,
  onCheckedChange,
  className,
  'aria-label': ariaLabel,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  className?: string
  'aria-label'?: string
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={ariaLabel}
      className={cn(
        'relative h-6 w-11 shrink-0 rounded-full border border-line bg-line/60 transition-colors duration-200',
        'data-[state=checked]:border-clay data-[state=checked]:bg-clay',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-clay/20',
        className,
      )}
    >
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-ink shadow-soft transition-transform duration-200 data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  )
}
