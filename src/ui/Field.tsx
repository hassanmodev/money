import { Root as LabelRoot } from '@radix-ui/react-label'
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'
import { cn } from '@/lib/cn'

export function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label?: ReactNode
  hint?: ReactNode
  htmlFor?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <LabelRoot
          htmlFor={htmlFor}
          className="text-xs font-medium uppercase tracking-[0.08em] text-faint"
        >
          {label}
        </LabelRoot>
      )}
      {children}
      {hint && <p className="text-xs leading-relaxed text-faint">{hint}</p>}
    </div>
  )
}

const fieldBase =
  'w-full rounded-xl border border-line bg-sunken/40 px-3.5 text-ink placeholder:text-ghost ' +
  'outline-none transition-all duration-200 focus:border-clay/50 focus:bg-sunken/70 ' +
  'focus:ring-4 focus:ring-clay/10'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldBase, 'h-11', className)} {...props} />
  ),
)
Input.displayName = 'Input'

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'min-h-20 py-2.5 leading-relaxed', className)} {...props} />
))
Textarea.displayName = 'Textarea'
