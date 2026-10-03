import { matchesCategory, normalizeCategory } from './categories'
import type { ActivityStatsModel } from './ActivityStatsModel'

type Entry = ActivityStatsModel['entries'][number]
export interface CategoryNode {
  path: string
  label: string
  amount: number
  count: number
  children: CategoryNode[]
  entries: Entry[]
}

export function spendingTree(entries: Entry[], query = ''): CategoryNode[] {
  const roots: CategoryNode[] = []
  for (const entry of entries) {
    if (entry.kind !== 'expense' || entry.excluded || !matchesCategory(entry.category, query)) continue
    const parts = normalizeCategory(entry.category || 'other').split('.')
    let children = roots
    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join('.')
      let node = children.find((item) => item.path === path)
      if (!node) {
        node = { path, label: parts[i], amount: 0, count: 0, children: [], entries: [] }
        children.push(node)
      }
      node.amount += entry.amount
      node.count += entry.count
      if (i === parts.length - 1) node.entries.push(entry)
      children = node.children
    }
  }
  function sort(nodes: CategoryNode[]) {
    nodes.sort((a, b) => b.amount - a.amount || a.path.localeCompare(b.path))
    for (const node of nodes) sort(node.children)
  }
  sort(roots)
  return roots
}
