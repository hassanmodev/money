import { describe, expect, it } from 'vitest'
import { childrenOf, descendantsOf, parentCode, parentOf, rollupTree } from '../codes'
import { mkProject } from './fixtures'

const ent = mkProject({ id: 'ent', code: 'ent', name: 'Entertainment' })
const screen = mkProject({ id: 'screen', code: 'ent-screen', name: 'Screen' })
const phone = mkProject({ id: 'phone', code: 'ent-screen-phone', name: 'Phone' })
const tv = mkProject({ id: 'tv', code: 'ent-screen-tv', name: 'TV' })
const read = mkProject({ id: 'read', code: 'ent-read', name: 'Reading' })
const gym = mkProject({ id: 'gym', name: 'Gym' }) // codeless

describe('parentCode', () => {
  it('strips the last segment', () => {
    expect(parentCode('ent-screen-phone')).toBe('ent-screen')
    expect(parentCode('ent')).toBeUndefined()
    expect(parentCode(undefined)).toBeUndefined()
  })
})

describe('parentOf', () => {
  const all = [ent, screen, phone, tv, read, gym]

  it('resolves the direct code prefix', () => {
    expect(parentOf(all, phone)?.id).toBe('screen')
    expect(parentOf(all, screen)?.id).toBe('ent')
    expect(parentOf(all, ent)).toBeUndefined()
    expect(parentOf(all, gym)).toBeUndefined()
  })

  it('is graceful when an intermediate level is missing', () => {
    const withoutScreen = [ent, phone, tv]
    expect(parentOf(withoutScreen, phone)?.id).toBe('ent')
  })
})

describe('childrenOf / descendantsOf', () => {
  const all = [ent, screen, phone, tv, read, gym]

  it('finds direct children only', () => {
    expect(childrenOf(all, ent).map((p) => p.id).sort()).toEqual(['read', 'screen'])
    expect(childrenOf(all, screen).map((p) => p.id).sort()).toEqual(['phone', 'tv'])
  })

  it('rolls up the whole subtree', () => {
    expect(descendantsOf(all, ent).map((p) => p.id).sort()).toEqual([
      'phone',
      'read',
      'screen',
      'tv',
    ])
  })
})

describe('rollupTree', () => {
  it('nests children under parents, codeless projects at the root', () => {
    const tree = rollupTree([phone, tv, ent, screen, read, gym])
    const byId = (id: string) => tree.find((n) => n.project.id === id)
    expect(tree.map((n) => n.project.id).sort()).toEqual(['ent', 'gym'])
    expect(byId('ent')!.children.map((n) => n.project.id)).toEqual(['read', 'screen'])
    expect(byId('ent')!.children[1].children.map((n) => n.project.id)).toEqual(['phone', 'tv'])
  })
})
