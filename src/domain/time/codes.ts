/**
 * Project codes — the only hierarchy mechanism. `ent-screen-phone` reads as
 * the `phone` sub-project of `screen` under `ent`. Sub-projects inherit
 * nothing but the naming convention and a roll-up: a parent's budget caps its
 * children's total, and the family reads as one group on the grid.
 */
import type { Project } from './types'

/** 'ent-screen-phone' → 'ent-screen' · 'ent' → undefined */
export const parentCode = (code?: string): string | undefined => {
  if (!code) return undefined
  const i = code.lastIndexOf('-')
  return i > 0 ? code.slice(0, i) : undefined
}

/** 'ent-screen-phone' → 'ent' */
export const rootCode = (code?: string): string | undefined => {
  if (!code) return undefined
  const i = code.indexOf('-')
  return i > 0 ? code.slice(0, i) : code
}

/** 0 for codeless/top-level, 1 for 'ent-screen', 2 for 'ent-screen-phone', … */
export const codeDepth = (code?: string): number => {
  if (!code) return 0
  return code.split('-').length - 1
}

/** The last segment is the project's own short name: 'ent-screen-phone' → 'phone'. */
export const codeLeaf = (code?: string): string | undefined => {
  if (!code) return undefined
  const i = code.lastIndexOf('-')
  return i >= 0 ? code.slice(i + 1) : code
}

const byCode = (projects: Project[]): Map<string, Project> => {
  const m = new Map<string, Project>()
  for (const p of projects) if (p.code) m.set(p.code, p)
  return m
}

/**
 * A project's parent is the longest *existing* code prefix — graceful when an
 * intermediate level was never created (`ent-screen-phone` with no
 * `ent-screen` rolls up straight to `ent`).
 */
export function parentOf(projects: Project[], p: Project): Project | undefined {
  const index = byCode(projects)
  let c = parentCode(p.code)
  while (c) {
    const found = index.get(c)
    if (found && found.id !== p.id) return found
    c = parentCode(c)
  }
  return undefined
}

/** The top-level ancestor (the project whose code has no dash), or undefined. */
export function familyRootOf(projects: Project[], p: Project): Project | undefined {
  let cur = parentOf(projects, p)
  let prev: Project | undefined
  while (cur) {
    prev = cur
    cur = parentOf(projects, cur)
  }
  return prev
}

/** Direct children only — projects whose resolved parent is `p`. */
export function childrenOf(projects: Project[], p: Project): Project[] {
  return projects.filter((q) => q.id !== p.id && parentOf(projects, q)?.id === p.id)
}

/** Every project that rolls up to `p`, at any depth. */
export function descendantsOf(projects: Project[], p: Project): Project[] {
  if (!p.code) return []
  const prefix = `${p.code}-`
  return projects.filter(
    (q) => q.id !== p.id && q.code?.startsWith(prefix) && isDescendant(projects, q, p),
  )
}

const isDescendant = (projects: Project[], q: Project, ancestor: Project): boolean => {
  let cur = parentOf(projects, q)
  let guard = 0
  while (cur && guard++ < 32) {
    if (cur.id === ancestor.id) return true
    cur = parentOf(projects, cur)
  }
  return false
}

export interface ProjectNode {
  project: Project
  children: ProjectNode[]
}

/**
 * The family tree for the sidebar: roots are projects with no resolved parent
 * (codeless projects included), each with its direct children nested. Sorted
 * by name at every level, archived projects last.
 */
export function rollupTree(projects: Project[]): ProjectNode[] {
  const nodes = new Map<string, ProjectNode>()
  for (const p of projects) nodes.set(p.id, { project: p, children: [] })

  const roots: ProjectNode[] = []
  for (const p of projects) {
    const parent = parentOf(projects, p)
    const node = nodes.get(p.id)!
    if (parent && nodes.has(parent.id)) nodes.get(parent.id)!.children.push(node)
    else roots.push(node)
  }

  const byName = (a: ProjectNode, b: ProjectNode) =>
    Number(!!a.project.archived) - Number(!!b.project.archived) ||
    a.project.name.localeCompare(b.project.name)
  const sortRec = (list: ProjectNode[]) => {
    list.sort(byName)
    for (const n of list) sortRec(n.children)
  }
  sortRec(roots)
  return roots
}
