import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn() } }))

import { DOCS_LINKS, isAllowedDocsUrl, openDocs } from '../../src/main/docsLinks'
import { DOCS_LINK_IDS } from '../../src/shared/docsLinkIds'

describe('openDocs', () => {
  const open = vi.fn().mockResolvedValue(undefined)
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('opens every id in the table through the opener', async () => {
    for (const id of DOCS_LINK_IDS) {
      open.mockClear()
      expect(await openDocs(id, open)).toBe(true)
      expect(open).toHaveBeenCalledWith(DOCS_LINKS[id])
    }
  })

  it('refuses an unknown id', async () => {
    for (const id of [
      'docs.nope',
      42,
      undefined,
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      null,
      { id: 'docs.home' },
      'https://ruby-raider.onrender.com/'
    ]) {
      expect(await openDocs(id, open)).toBe(false)
    }
    expect(open).not.toHaveBeenCalled()
    expect(console.warn).toHaveBeenCalledWith('open-docs refused', 'docs.nope')
  })

  it('refuses a non-https or foreign URL even from the table', async () => {
    expect(
      await openDocs('docs.home', open, { 'docs.home': 'http://ruby-raider.onrender.com/' })
    ).toBe(false)
    expect(await openDocs('docs.home', open, { 'docs.home': 'https://evil.example/' })).toBe(false)
    expect(
      await openDocs('docs.home', open, {
        'docs.home': 'https://ruby-raider.onrender.com.evil.example/'
      })
    ).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('never rejects: a failing opener gives false and a warning', async () => {
    const boom = new Error('boom')
    const failing = vi.fn().mockRejectedValue(boom)
    expect(await openDocs('docs.home', failing)).toBe(false)
    expect(console.warn).toHaveBeenCalledWith('open-docs failed', 'docs.home', boom)
  })

  it('logs a refused id as a short string or its type, not the raw value', async () => {
    await openDocs('x'.repeat(200), open)
    expect(console.warn).toHaveBeenCalledWith('open-docs refused', 'x'.repeat(64))
    await openDocs({ a: 1 }, open)
    expect(console.warn).toHaveBeenCalledWith('open-docs refused', 'object')
  })

  it.each([
    'https://user:pw@github.com:8443/',
    'https://github.com@evil.example/',
    'https://docs.github.com/',
    'file:///etc/passwd',
    'javascript:alert(1)'
  ])('the guard refuses %s', (url) => {
    expect(isAllowedDocsUrl(url)).toBe(false)
  })

  it('every table URL passes the guard', () => {
    for (const url of Object.values(DOCS_LINKS)) expect(isAllowedDocsUrl(url)).toBe(true)
  })
})
