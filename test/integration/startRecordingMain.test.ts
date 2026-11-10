import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({ webContents: { fromId: (): undefined => undefined } }))

import { appState } from '../../src/main/handlers/appState'
import startRecordingMain from '../../src/main/handlers/recording/startRecordingMain'
import stopRecordingMain from '../../src/main/handlers/recording/stopRecordingMain'

beforeEach(() => {
  appState.mainWindow = null
  appState.sessionUrl = 'https://shop.test/'
  appState.recordingMode = 'test'
})

describe('the recorder mode', () => {
  it('is a test by default', () => {
    expect(startRecordingMain().success).toBe(true)
    expect(appState.recordingMode).toBe('test')
  })

  it("is a flow only for exactly { mode: 'flow' }", () => {
    expect(startRecordingMain({ mode: 'flow' }).success).toBe(true)
    expect(appState.recordingMode).toBe('flow')
  })

  it.each([
    ['an IPC event', { sender: {}, mode: undefined }],
    ['null', null],
    ['a string', 'flow'],
    ['another case', { mode: 'FLOW' }],
    ['a test', { mode: 'test' }],
    ['an array', ['flow']],
    ['a non-string mode', { mode: ['flow'] }]
  ])('is a test for %s', (_label, arg) => {
    appState.recordingMode = 'flow'
    expect(startRecordingMain(arg).success).toBe(true)
    expect(appState.recordingMode).toBe('test')
  })

  it('does not change when the recording does not start', () => {
    appState.sessionUrl = 'file:///x.html'
    expect(startRecordingMain({ mode: 'flow' }).success).toBe(false)
    expect(appState.recordingMode).toBe('test')
  })

  it('goes back to a test when the recording stops', () => {
    startRecordingMain({ mode: 'flow' })
    stopRecordingMain()
    expect(appState.recordingMode).toBe('test')
  })
})
