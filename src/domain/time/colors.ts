/**
 * Project colors: auto-assigned from a warm palette harmonized with the app,
 * with per-project override. Sub-projects derive as shades of the parent's
 * hue, so a family reads as one group on the grid.
 *
 * The swatches intentionally mirror `lib/palette` — the time domain stays
 * dependency-free, so the hexes are duplicated rather than imported.
 */
import { parentCode, rootCode } from './codes'
import type { Project } from './types'

export const TIME_SWATCHES: string[] = [
  '#d4845c', // clay
  '#e0aa66', // honey
  '#cba24f', // ochre
  '#9eb87f', // sage
  '#74b1a3', // teal
  '#8aa0c8', // dusk
  '#b88cc0', // plum
  '#db8a82', // rose
]

/** djb2 — stable so a family's colors don't reshuffle between sessions. */
const hash = (s: string): number => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface Hsl {
  h: number
  s: number
  l: number
}

export function hexToHsl(hex: string): Hsl {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let hue: number
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / d + 2) / 6
  else hue = ((r - g) / d + 4) / 6
  return { h: Math.round(hue * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToHex({ h, s, l }: Hsl): string {
  const sat = Math.max(0, Math.min(100, s)) / 100
  const lig = Math.max(0, Math.min(100, l)) / 100
  const k = (n: number) => (n + h / 30) % 12
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`
}

/** Stagger lightness per sibling so a family's shades stay distinguishable. */
const SHADE_STEPS = [-14, 0, 14, -7, 7]

/**
 * The color a project would get with no override: a stable hue per top-level
 * family, sub-projects shaded off their parent's hue by sibling position.
 */
export function autoColor(
  projects: Project[],
  candidate: Pick<Project, 'name' | 'code'>,
): string {
  const root = rootCode(candidate.code)
  if (!root) return TIME_SWATCHES[hash(candidate.name.trim().toLowerCase()) % TIME_SWATCHES.length]

  const index = new Map<string, Project>()
  for (const p of projects) if (p.code) index.set(p.code, p)

  // walk up to the nearest existing ancestor to borrow its hue
  let ancestor: Project | undefined
  let c = parentCode(candidate.code)
  while (c && !ancestor) {
    ancestor = index.get(c)
    c = parentCode(c)
  }

  const baseHex =
    ancestor?.color ?? TIME_SWATCHES[hash(root.toLowerCase()) % TIME_SWATCHES.length]
  if (!ancestor) return baseHex

  // shade by position among the (already existing) siblings
  const parent = ancestor
  const siblings = projects
    .filter((p) => {
      if (!p.code) return false
      let pc = parentCode(p.code)
      while (pc) {
        if (pc === parent.code) return true
        pc = parentCode(pc)
      }
      return false
    })
    .map((p) => p.code!)
    .sort()
  let i = siblings.indexOf(candidate.code!)
  if (i < 0) i = siblings.length
  const hsl = hexToHsl(baseHex)
  return hslToHex({ ...hsl, l: hsl.l + SHADE_STEPS[i % SHADE_STEPS.length] })
}

/** The color the grid should use for a project (override or auto). */
export function projectColor(projects: Project[], p: Project): string {
  return p.color ?? autoColor(projects, p)
}
