import { cn } from '@/lib/cn'

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'grid size-9 place-items-center rounded-xl bg-gradient-to-br from-clay to-honey shadow-soft',
        className,
      )}
    >
      <span className="-mt-0.5 font-serif text-xl font-semibold text-canvas">m</span>
    </div>
  )
}
