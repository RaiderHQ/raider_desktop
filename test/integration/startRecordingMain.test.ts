import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({ webContents: { fromId: (): undefined => undefined } }))

import { appState } from '../../src/main/handlers/appState'
import startRecordingMain from '../../src/main/handlers/recording/startRecordingMain'

beforeEach(() => {
  appState.mainWindow = null
  appState.sessionUrl = 'https://shop.test/'
})

// An older renderer could ask for { mode: 'flow' }. The recorder has one mode now: whatever
// arrives (the IPC event comes first), recording starts the same and no mode is kept.
describe('start-recording-main', () => {
  it.each([
    ['nothing', undefined],
    ["{ mode: 'flow' }", { mode: 'flow' }],
    ['an IPC event', { sender: {}, mode: 'flow' }],
    ["the string 'flow'", 'flow']
  ])('records the same for %s and keeps no mode', (_label, arg) => {
    const result = (
      startRecordingMain as (options?: unknown) => ReturnType<typeof startRecordingMain>
    )(arg)
    expect(result).toEqual({
      success: true,
      url: 'https://shop.test/',
      preloadPath: expect.any(String)
    })
    expect(appState).not.toHaveProperty('recordingMode')
  })
})
