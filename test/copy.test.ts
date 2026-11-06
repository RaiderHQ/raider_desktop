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
  it('words the save branch plainly (PR B)', () => {
    expect(en.testPage.autosaved).toBe('Changes to this test are saved automatically.')
    expect(en.files.unsavedSuffix).toBe('{{name}}, unsaved changes')
    expect(en.closeGuard.message).toBe('Save changes to {{name}}?')
    expect(en.closeGuard.save).toBe('Save')
    expect(en.closeGuard.discard).toBe("Don't save")
    expect(en.closeGuard.cancel).toBe('Cancel')
  })

  it('uses sentence case in the modals and menus', () => {
    expect(en.concepts.title).toBe('How Ruby Raider works')
    expect(en.concepts.hint).toBe('Hover any button for what it does.')
    expect(en.overview.tabs.scaffold).toBe('Scaffolding')
    expect(en.overview.openTerminal).toBe('Open terminal')
    expect(en.files.menu.copyPath).toBe('Copy path')
    expect(en.files.menu.rename).toBe('Rename')
    expect(en.files.menu.duplicate).toBe('Duplicate')
    expect(en.files.menu.delete).toBe('Delete')
    expect(en.files.delete.title).toBe('Delete file?')
    expect(en.files.delete.cancel).toBe('Cancel')
    expect(en.files.delete.confirm).toBe('Delete')
    expect(en.files.rename.title).toBe('Rename file')
    expect(en.common.back).toBe('Go back')
    expect(en.header.howItWorks).toBe('How Ruby Raider works')
    expect(en.landing.bubble).toBe('New here? Click me.')
    expect(en.recorder.step.editCommand).toBe('Edit command')
    expect(en.recorder.step.doubleClickToEdit).toBe('Double-click to edit')
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

  it('no title case in buttons, labels and titles', () => {
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
      'OS',
      'Windows',
      'macOS',
      'Linux',
      'iOS',
      'Android',
      'JSON',
      'YAML',
      'API',
      'Hideout',
      'Longship',
      'Watir',
      'Homebrew',
      'WSL',
      'LLM',
      'AI'
    ]
    const names = [
      'title',
      'label',
      'button',
      'save',
      'cancel',
      'close',
      'delete',
      'rename',
      'start',
      'stop',
      'run',
      'record'
    ]
    const found: [string, string][] = []
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') found.push([path, node])
      else if (node && typeof node === 'object')
        for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k)
    }
    walk(en, '')
    const offenders: string[] = []
    let checked = 0
    for (const [path, text] of found) {
      const last = path.split('.').pop() as string
      if (!(names.includes(last) || /(Button|Label|Title)$/.test(last))) continue
      checked++
      // Step numbers ("1. Install") and {{placeholders}} are not words.
      const words = text
        .replace(/^\d+\.\s*/, '')
        .replace(/\{\{[^}]*\}\}\??/g, '')
        .split(/\s+/)
        .filter(Boolean)
      // Allowlisted names may also be followed by a second name ("Ruby Raider", "Google Chrome").
      const stray = words
        .slice(1)
        .filter(
          (w) =>
            /[A-Z]/.test(w) && !allowed.includes(w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
        )
      if (stray.length) offenders.push(`${path}: "${text}" (${stray.join(', ')})`)
    }
    expect(checked).toBeGreaterThan(50)
    expect(offenders).toEqual([])
  })
})
