import { describe, it, expect } from 'vitest'
import en from '../src/renderer/src/assets/translations/en.json'

/** Copy decisions from the 2026-11-06 hand test (D10, D12, sentence case, jargon). */
describe('copy', () => {
  it('does not promise hover help or run history the app does not have (D10)', () => {
    expect(en.concepts.hint).not.toMatch(/Hover over any/)
    expect(en.help.overview.dashboard.message).not.toMatch(/trends|run history/)
    expect(en.dashboard.noResults.subtitle).toMatch(/Tests tab/)
  })

  it('calls a test that lives in a file "From file", not edited (D12)', () => {
    expect(en.tests.editedInCode).toBe('From file')
  })

  it('uses sentence case in the Files toolbar and the Dashboard', () => {
    expect(en.overview.settings.runMode.all).toBe('All tests')
    expect(en.overview.settings.rerunFailed).toBe('Re-run failed')
    expect(en.settings.recording.implicitWait.label).toBe('Implicit wait')
    expect(en.settings.recording.explicitWait.label).toBe('Explicit wait')
    expect(en.settings.timeout.updateButton).toBe('Update timeout')
    expect(en.testResults.breakdown).toBe('Test results breakdown')
    expect(en.testResults.viewScreenshot).toBe('View screenshot')
    expect(en.dashboard.overallSummary).toBe('Overall summary')
    expect(en.dashboard.totalTests).toBe('Total tests')
    expect(en.dashboard.viewTrace).toBe('View trace')
    expect(en.dashboard.backToResults).toBe('Back to results')
    expect(en.dashboard.traceTitle).toBe('Trace view')
  })

  it('speaks plainly in the empty recorder and on the landing page', () => {
    expect(en.recorder.placeholder.commands).toBe(
      'Steps you record will appear here. Press Record to begin.'
    )
    expect(en.landing.subtitle).toBe('Record, run and fix UI tests without leaving the app.')
  })
  it('every tooltip is sentence case, short and has no shortcut typed in', () => {
    const allowed = [
      'Ruby',
      'Raider',
      'RSpec',
      'Cucumber',
      'Selenium',
      'Appium',
      'Chrome',
      'Firefox',
      'URL',
      'CI',
      'Esc',
      'HTML',
      'GitHub',
      'OS'
    ]
    const strings: [string, string][] = []
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') strings.push([path, node])
      else if (node && typeof node === 'object')
        for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`)
    }
    walk(en.tooltips, 'tooltips')
    expect(strings.length).toBeGreaterThan(50)
    const offenders: string[] = []
    for (const [path, text] of strings) {
      const bare = text.replace(/https:\/\/\S+/g, '').trim()
      const words = bare.split(/\s+/).filter(Boolean)
      const stray = words
        .slice(1)
        .filter(
          (w) =>
            /[A-Z]/.test(w) && !allowed.includes(w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
        )
      if (!/^[A-Z0-9]/.test(text)) offenders.push(`${path}: must start upper case or digit`)
      if (stray.length) offenders.push(`${path}: stray capitals ${stray.join(', ')}`)
      if (words.length > 14) offenders.push(`${path}: ${words.length} words`)
      if (/[⌘⇧]|Ctrl\+|Cmd\+/.test(text)) offenders.push(`${path}: shortcut typed in`)
    }
    expect(offenders).toEqual([])
  })

  it('the check dialogs speak plainly', () => {
    const m = en.recorder.assertionTextModal
    expect(Object.values(m.titles)).toEqual([
      'Check the text',
      'Check the text contains',
      'Check the value',
      'Check the page title',
      'Check the address'
    ])
    expect(m.save).toBe('Add check')
    expect(en.assertions.menu.header).toBe('Add a check')
  })

  it('words the recording guide plainly', () => {
    expect(en.guide.step1).toBe(
      'Use the page on the right as you normally would. Every click and keystroke becomes a step here.'
    )
    expect(en.guide.step2).toBe(
      'To check something, press Check something\u2026 (or right-click the page) and choose what to check.'
    )
    expect(en.guide.step3).toBe('Press Stop & save when you are done, then Run to see it pass.')
  })
})
