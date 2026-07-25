/**
 * The time & projects slice — a separate zustand store on a separate
 * localStorage key (`cozy-time/v1`), deliberately decoupled from the money
 * store. Same discipline: persist data only, never the actions; the engine in
 * `domain/time` stays pure and everything derived is recomputed from here.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Block,
  Fragment,
  Project,
  Quality,
  RuleOverride,
  TimeRule,
  TimeSettings,
  TimeState,
} from '@/domain/time'
import { autoColor, parseRule } from '@/domain/time'
import { todayISO } from '@/lib/date'
import { newId } from '@/lib/id'
import { createTimeEmpty, createTimeSeed } from './timeSeed'

export type NewProject = Omit<Project, 'id' | 'createdAt'>
export type NewQuality = Omit<Quality, 'id'>
export type NewBlock = Omit<Block, 'id' | 'createdAt'>
export type NewFragment = Omit<Fragment, 'id' | 'createdAt'>

interface Actions {
  addProject: (p: NewProject) => string
  updateProject: (id: string, patch: Partial<Project>) => void
  /** Removes the project plus its blocks, rules, and fragments; children keep their codes. */
  removeProject: (id: string) => void

  addQuality: (q: NewQuality) => string
  updateQuality: (id: string, patch: Partial<Quality>) => void
  /** Removes the quality and strips every effect/requirement/dependency that referenced it. */
  removeQuality: (id: string) => void

  /** Parses the text first; returns the rule id, or null when it doesn't parse. */
  addRule: (projectId: string, text: string, note?: string) => string | null
  updateRule: (id: string, patch: Partial<Pick<TimeRule, 'text' | 'note'>>) => void
  removeRule: (id: string) => void
  /** Delete one rule-generated occurrence. */
  skipRuleOccurrence: (ruleId: string, key: string) => void
  /** Move/edit one rule-generated occurrence — generated blocks stay draggable. */
  overrideRuleOccurrence: (ruleId: string, key: string, patch: RuleOverride) => void

  addBlock: (b: NewBlock) => string
  updateBlock: (id: string, patch: Partial<Block>) => void
  removeBlock: (id: string) => void

  addFragment: (f: NewFragment) => string
  removeFragment: (id: string) => void

  updateTimeSettings: (patch: Partial<TimeSettings>) => void

  resetAll: () => void
  clearAll: () => void
}

export type TimeStore = TimeState & Actions

const now = () => new Date().toISOString()

export const useTimeStore = create<TimeStore>()(
  persist(
    (set) => ({
      ...createTimeSeed(todayISO()),

      addProject: (p) => {
        const id = newId('proj')
        set((s) => ({
          projects: [
            ...s.projects,
            { ...p, id, color: p.color ?? autoColor(s.projects, p), createdAt: now() },
          ],
        }))
        return id
      },
      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),
      removeProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          blocks: s.blocks.filter((b) => b.projectId !== id),
          rules: s.rules.filter((r) => r.projectId !== id),
          fragments: s.fragments.filter((f) => f.projectId !== id),
        })),

      addQuality: (q) => {
        const id = newId('q')
        set((s) => ({ qualities: [...s.qualities, { ...q, id }] }))
        return id
      },
      updateQuality: (id, patch) =>
        set((s) => ({
          qualities: s.qualities.map((q) => (q.id === id ? { ...q, ...patch } : q)),
        })),
      removeQuality: (id) =>
        set((s) => ({
          qualities: s.qualities.filter((q) => q.id !== id),
          // strip dangling references so the engine never sees a ghost quality
          projects: s.projects.map((p) => ({
            ...p,
            effects: p.effects.filter((e) => e.quality !== id),
            requires: p.requires.filter((r) => r.quality !== id),
          })),
        })),

      addRule: (projectId, text, note) => {
        if (!parseRule(text).ok) return null
        const id = newId('rule')
        set((s) => ({
          rules: [...s.rules, { id, projectId, text: text.trim(), note, skipped: [], overrides: {}, createdAt: now() }],
        }))
        return id
      },
      updateRule: (id, patch) =>
        set((s) => ({
          rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),
      removeRule: (id) =>
        set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      skipRuleOccurrence: (ruleId, key) =>
        set((s) => ({
          rules: s.rules.map((r) =>
            r.id !== ruleId || r.skipped.includes(key)
              ? r
              : { ...r, skipped: [...r.skipped, key] },
          ),
        })),
      overrideRuleOccurrence: (ruleId, key, patch) =>
        set((s) => ({
          rules: s.rules.map((r) =>
            r.id !== ruleId
              ? r
              : { ...r, overrides: { ...r.overrides, [key]: { ...r.overrides[key], ...patch } } },
          ),
        })),

      addBlock: (b) => {
        const id = newId('blk')
        set((s) => ({ blocks: [...s.blocks, { ...b, id, createdAt: now() }] }))
        return id
      },
      updateBlock: (id, patch) =>
        set((s) => ({
          blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        })),
      removeBlock: (id) =>
        set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) })),

      addFragment: (f) => {
        const id = newId('frag')
        set((s) => ({ fragments: [...s.fragments, { ...f, id, createdAt: now() }] }))
        return id
      },
      removeFragment: (id) =>
        set((s) => ({ fragments: s.fragments.filter((f) => f.id !== id) })),

      updateTimeSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      resetAll: () => set({ ...createTimeSeed(todayISO()) }),
      clearAll: () => set({ ...createTimeEmpty() }),
    }),
    {
      name: 'cozy-time/v1',
      version: 1,
      // persist only the data, never the action functions
      partialize: (s): TimeState => ({
        projects: s.projects,
        qualities: s.qualities,
        blocks: s.blocks,
        rules: s.rules,
        fragments: s.fragments,
        settings: s.settings,
      }),
    },
  ),
)

/** Read the live time state outside React (e.g. for one-off calculations). */
export const timeState = (): TimeState => {
  const s = useTimeStore.getState()
  return {
    projects: s.projects,
    qualities: s.qualities,
    blocks: s.blocks,
    rules: s.rules,
    fragments: s.fragments,
    settings: s.settings,
  }
}
