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
})
