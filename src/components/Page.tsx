import { motion } from 'motion/react'
import type { ReactNode } from 'react'

/** Gentle enter transition wrapping each routed page. */
export function Page({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
