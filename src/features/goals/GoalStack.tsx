import { Layers } from 'lucide-react'
import { motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import type { Goal, GoalGroup } from '@/domain'
import { GoalCard } from './GoalCard'

export interface GoalStackItem {
  goal: Goal
  happiness: number
  badge?: ReactNode
  /** date the goal has happened by (real or a passed committed buy) — shown achieved */
  achievedOn?: string
}

/** Rest: each card behind peeks up by this much, building the deck's edge. */
const REST_PEEK = 13
/** Rest: each card behind also slides aside by this much, skewing the deck. */
const REST_SLIDE = 12
/** Rest: how far back each card recedes in 3D (px of translateZ). */
const REST_DEPTH = 60
/** Open: compact downward spread — enough to read & click each, far less than a full fan. */
const OPEN_STEP = 56
/** The deck lifts above neighbouring cards while it's fanned out. */
const OPEN_Z = 50
const EASE = [0.16, 1, 0.3, 1] as const

/**
 * A group of alternative goals shown as one compact, 3D-skewed deck. At rest the
 * siblings lean back behind the front card like a stack of cards seen at an
 * angle; on hover the deck flattens and spreads just enough to slide the mouse
 * across every option, read it at a glance, and click through to the one you
 * want. Items arrive primary-first (the planner's pick on top).
 *
 * Paint order is strictly monotonic with depth — front-of-deck wins at rest,
 * lowest-fanned-card wins when open — so every card keeps a visible strip and
 * none ever hides under a neighbour. The hovered card is highlighted by the
 * card's own hover lift, not by reordering. The whole deck rises above adjacent
 * cards while open (the z-index lives on this grid item, not a trapped child).
 */
export function GoalStack({
  group,
  halfLifeMonths,
  items,
  onEdit,
  entranceDelay = 0,
}: {
  group?: GoalGroup
  halfLifeMonths: number
  items: GoalStackItem[]
  onEdit: (goal: Goal) => void
  entranceDelay?: number
}) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState<number | null>(null)
  const n = items.length

  const entrance = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, delay: entranceDelay, ease: EASE },
  }

  // A lone member in this status isn't a deck — render it as a plain card.
  if (n <= 1) {
    const it = items[0]
    return (
      <motion.div className="h-full" {...entrance}>
        <GoalCard goal={it.goal} group={group} halfLifeMonths={halfLifeMonths} happiness={it.happiness} badge={it.badge} achievedOn={it.achievedOn} onEdit={() => onEdit(it.goal)} />
      </motion.div>
    )
  }

  return (
    <motion.div
      className="relative [perspective:1500px]"
      // z-index sits on the grid item itself, so the fanned deck clears every
      // neighbouring card instead of being trapped in its own stacking context.
      style={{ zIndex: open ? OPEN_Z : undefined }}
      {...entrance}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false)
        setHovered(null)
      }}
    >
      {items.map((it, i) => {
        const hot = hovered === i
        // Open: the hovered card sits on top, and the rest fan outward from it in
        // order (nearer = higher), so every card below it still reads in sequence.
        // Until a card is hovered it's the clean cascade (lower = higher). At rest
        // it's the deck, front card on top.
        const zIndex = open ? (hovered == null ? i : n - Math.abs(i - hovered)) : n - i
        return (
        <motion.div
          key={it.goal.id}
          // the front card stays in flow so the deck is exactly one card tall at rest
          className={i === 0 ? 'relative' : 'absolute inset-x-0 top-0'}
          style={{ zIndex, transformStyle: 'preserve-3d', transformOrigin: 'center top' }}
          initial={false}
          animate={
            open
              ? { x: 0, y: i * OPEN_STEP, z: hot ? 50 : 0, rotateX: 0, rotateZ: 0, scale: hot ? 1.04 : 1, opacity: 1 }
              : {
                  x: i * REST_SLIDE,
                  y: i * -REST_PEEK,
                  z: i * -REST_DEPTH,
                  rotateX: i === 0 ? -3 : -18,
                  rotateZ: i * 2,
                  scale: 1 - i * 0.045,
                  opacity: i > 2 ? 0 : 1 - i * 0.12,
                }
          }
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          onMouseEnter={() => setHovered(i)}
        >
          <GoalCard
            goal={it.goal}
            group={group}
            halfLifeMonths={halfLifeMonths}
            happiness={it.happiness}
            badge={it.badge}
            achievedOn={it.achievedOn}
            onEdit={() => onEdit(it.goal)}
          />
        </motion.div>
        )
      })}

      {/* count chip — a hint that there's a deck here, tucked away once opened */}
      <motion.div
        className="pointer-events-none absolute -right-2 -top-2 z-[60] flex items-center gap-1 rounded-full border border-line bg-raised px-2 py-0.5 text-[11px] font-medium text-muted shadow-soft"
        animate={{ opacity: open ? 0 : 1, scale: open ? 0.9 : 1 }}
        transition={{ duration: 0.18 }}
      >
        <Layers className="size-3" />
        {n} options
      </motion.div>
    </motion.div>
  )
}
