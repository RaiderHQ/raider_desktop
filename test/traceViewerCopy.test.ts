import { describe, it, expect } from 'vitest'
import i18next from 'i18next'
import en from '../src/renderer/src/assets/translations/en.json'

const t = async (): Promise<typeof i18next.t> => {
  const i18n = i18next.createInstance()
  await i18n.init({ lng: 'en', resources: { en: { translation: en } } })
  return i18n.t
}

describe('trace viewer copy', () => {
  it('says how many times a step was tried again, in plural forms', async () => {
    const tr = await t()
    expect(tr('traceViewer.retries', { count: 1 })).toBe('Tried again once')
    expect(tr('traceViewer.retries', { count: 9 })).toBe('Tried again 9 times')
  })

  it('does not claim which steps, requests or messages a capped list left out', async () => {
    // The trace keeps its newest entries, the viewer its first ones; the same count holds both.
    const tr = await t()
    for (const list of ['steps', 'network', 'console']) {
      const text = tr(`traceViewer.truncated.${list}`)
      expect(text).not.toMatch(/older|later|newer|earlier/i)
      expect(text).toMatch(/not shown/)
    }
  })

  it('words the match_screenshot step', async () => {
    const tr = await t()
    expect(tr('traceViewer.step.matchScreenshot', { name: 'home' })).toBe(
      'Compared screenshot "home"'
    )
    expect(tr('traceViewer.step.matchScreenshotFailed', { name: 'home' })).toBe(
      'Screenshot "home" did not match'
    )
  })

  it('says when a page could not be shown safely', async () => {
    const tr = await t()
    expect(tr('traceViewer.snapshotUnsafe')).toBe("This page couldn't be shown safely.")
  })

  it('labels mocked and blocked requests and says where their response came from', async () => {
    const tr = await t()
    expect(tr('traceViewer.network.mocked')).toBe('Mocked')
    expect(tr('traceViewer.network.blockedByTest')).toBe('Blocked by test')
    expect(tr('traceViewer.network.mockedHint')).toBe(
      'Mocked and blocked responses came from the test, not the server'
    )
  })
})
