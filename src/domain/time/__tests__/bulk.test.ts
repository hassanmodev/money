import { describe, expect, it } from 'vitest'
import { parseBulkCreate } from '../bulk'
import { mkProject } from './fixtures'

const ent = mkProject({ id: 'ent', code: 'ent', name: 'Entertainment' })
const work = mkProject({ id: 'work', code: 'work', name: 'Work' })

describe('parseBulkCreate', () => {
  it('ignores comments and blank lines', () => {
    const plan = parseBulkCreate('# just a comment\n\nent: yt # trailing\n', null, [])
    expect(plan.errors).toEqual([])
    expect(plan.creates.map((c) => c.code)).toEqual(['ent', 'ent-yt'])
  })

  it('gives bare items the default fr claim (share 1, scope parent)', () => {
    const plan = parseBulkCreate('ent: yt, tik', null, [])
    const leaves = plan.creates.filter((c) => !c.group)
    expect(leaves.map((c) => c.fr)).toEqual([
      { share: 1, scope: 'parent' },
      { share: 1, scope: 'parent' },
    ])
    expect(leaves.every((c) => !c.budget)).toBe(true)
  })

  it('applies a line-default budget with per-item override', () => {
    const plan = parseBulkCreate('ent: 1h, phone-yt, phone-tik 2h', null, [])
    const yt = plan.creates.find((c) => c.code === 'ent-phone-yt')!
    const tik = plan.creates.find((c) => c.code === 'ent-phone-tik')!
    expect(yt.budget).toMatchObject({ min: 60, max: 60, intent: 'target', spread: 'any' })
    expect(yt.budget?.period).toEqual({ kind: 'day' })
    expect(tik.budget?.min).toBe(120)
    // the line default also reaches the other item, intermediates stay plain
    expect(plan.creates.find((c) => c.code === 'ent-phone')?.group).toBe(true)
  })

  it('parses minutes, decimals, and period suffixes', () => {
    const plan = parseBulkCreate('ent: a 30m, b 1.5h/w, c 10h/mo, d 2fr', null, [])
    const get = (leaf: string) => plan.creates.find((c) => c.code === `ent-${leaf}`)!
    expect(get('a').budget).toMatchObject({ min: 30, period: { kind: 'day' } })
    expect(get('b').budget).toMatchObject({ min: 90, period: { kind: 'week' } })
    expect(get('c').budget).toMatchObject({ min: 600, period: { kind: 'month' } })
    expect(get('d').fr).toEqual({ share: 2, scope: 'parent' })
  })

  it('keeps the selected parent code as prefix', () => {
    const plan = parseBulkCreate('ent: yt', work, [work])
    expect(plan.creates.map((c) => c.code)).toEqual(['work-ent', 'work-ent-yt'])
  })

  it('auto-creates missing intermediates from line codes and nested items', () => {
    const plan = parseBulkCreate('ent-phone: yt\nent: series-thriller', null, [ent])
    expect(plan.creates.map((c) => [c.code, !!c.group])).toEqual([
      ['ent-phone', true],
      ['ent-phone-yt', false],
      ['ent-series', true],
      ['ent-series-thriller', false],
    ])
  })

  it('skips existing codes without touching them', () => {
    const plan = parseBulkCreate('ent: yt', null, [ent, mkProject({ id: 'x', code: 'ent-yt' })])
    expect(plan.creates).toEqual([])
    expect(plan.skips).toEqual([{ code: 'ent-yt', line: 1, reason: 'already exists' }])
  })

  it('skips duplicates within the text', () => {
    const plan = parseBulkCreate('ent: yt\nent: yt 2h', null, [])
    expect(plan.skips).toEqual([{ code: 'ent-yt', line: 2, reason: 'duplicate' }])
  })

  it('lets a later line give a claim to an earlier auto-created group', () => {
    const plan = parseBulkCreate('ent-phone: yt\nent: phone 2h', null, [])
    const phone = plan.creates.find((c) => c.code === 'ent-phone')!
    expect(phone.group).toBeUndefined()
    expect(phone.budget?.min).toBe(120)
  })

  it('applies a claim-only line to the line code itself', () => {
    const plan = parseBulkCreate('ent: 1h', null, [])
    expect(plan.creates).toEqual([
      expect.objectContaining({ code: 'ent', name: 'ent', budget: expect.objectContaining({ min: 60 }) }),
    ])
  })

  it('reports errors per line without aborting the rest', () => {
    const plan = parseBulkCreate('no colon here\nent:\nent: yt, 2h\nent: ok', null, [])
    expect(plan.errors.map((e) => e.line)).toEqual([1, 2, 3])
    expect(plan.errors[2].message).toBe('amount without a project')
    expect(plan.creates.some((c) => c.code === 'ent-ok')).toBe(true)
  })

  it('takes a display name after the code, quoted string as note', () => {
    const plan = parseBulkCreate('fun-phone Phone: soc Social "x,fb", vid Video 1h "yt,tik"', null, [])
    const phone = plan.creates.find((c) => c.code === 'fun-phone')!
    expect(phone).toMatchObject({ name: 'Phone', group: true })
    const soc = plan.creates.find((c) => c.code === 'fun-phone-soc')!
    expect(soc).toMatchObject({ name: 'Social', note: 'x,fb', fr: { share: 1, scope: 'parent' } })
    const vid = plan.creates.find((c) => c.code === 'fun-phone-vid')!
    expect(vid).toMatchObject({ name: 'Video', note: 'yt,tik' })
    expect(vid.budget?.min).toBe(60)
  })

  it('treats a quoted item as a spaced name with a derived code', () => {
    const plan = parseBulkCreate('fun-watch Watch: mov, ser, "Social Media"', null, [])
    expect(plan.creates.find((c) => c.code === 'fun-watch')?.name).toBe('Watch')
    expect(plan.creates.map((c) => c.code)).toContain('fun-watch-social-media')
    expect(plan.creates.find((c) => c.code === 'fun-watch-social-media')?.name).toBe('Social Media')
    // single bare words stay as they were: code leaf is the name
    expect(plan.creates.find((c) => c.code === 'fun-watch-mov')?.name).toBe('mov')
  })

  it('never reads case: unquoted words are always code then name', () => {
    const plan = parseBulkCreate('fun: VID Video, "Quoted Name" 2h', null, [])
    const vid = plan.creates.find((c) => c.code === 'fun-vid')!
    expect(vid.name).toBe('Video')
    const quoted = plan.creates.find((c) => c.code === 'fun-quoted-name')!
    expect(quoted).toMatchObject({ name: 'Quoted Name' })
    expect(quoted.budget?.min).toBe(120)
  })

  it('takes a quoted header as a spaced group name', () => {
    const plan = parseBulkCreate('"Fun Stuff": chess', null, [])
    expect(plan.creates.find((c) => c.code === 'fun-stuff')).toMatchObject({
      name: 'Fun Stuff',
      group: true,
    })
    expect(plan.creates.map((c) => c.code)).toContain('fun-stuff-chess')
  })

  it('names a claim-only line from its header', () => {
    const plan = parseBulkCreate('ent Entertainment "all the fun": 1h', null, [])
    expect(plan.creates).toEqual([
      expect.objectContaining({ code: 'ent', name: 'Entertainment', note: 'all the fun' }),
    ])
  })

  it('flags unterminated quotes', () => {
    const plan = parseBulkCreate('ent: yt "oops', null, [])
    expect(plan.errors).toEqual([{ line: 1, message: 'unterminated quote' }])
    expect(plan.creates).toEqual([])
  })
})
