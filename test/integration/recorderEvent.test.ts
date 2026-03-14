import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    projectAutomation: null,
    mainWindow: {
      webContents: {
        send: (...args: unknown[]) => mockSend(...args)
      }
    }
  }
}))

import recorderEvent from '../../src/main/handlers/recording/recorderEvent'
import { appState } from '../../src/main/handlers/appState'

describe('recorderEvent handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(appState as { projectAutomation: string | null }).projectAutomation = null
  })

  it('sends selenium command by default (null automation)', () => {
    recorderEvent({
      action: 'click',
      selector: '#btn',
      strategy: 'css',
      tagName: 'BUTTON'
    })

    expect(mockSend).toHaveBeenCalledWith(
      'new-recorded-command',
      expect.stringContaining('@driver.find_element')
    )
  })

  it('sends capybara command when projectAutomation is capybara', () => {
    ;(appState as { projectAutomation: string | null }).projectAutomation = 'capybara'

    recorderEvent({
      action: 'click',
      selector: '.btn',
      strategy: 'css',
      tagName: 'BUTTON'
    })

    expect(mockSend).toHaveBeenCalledWith(
      'new-recorded-command',
      expect.stringContaining('find(')
    )
  })

  it('sends watir command when projectAutomation is watir', () => {
    ;(appState as { projectAutomation: string | null }).projectAutomation = 'watir'

    recorderEvent({
      action: 'click',
      selector: 'myId',
      strategy: 'id',
      tagName: 'INPUT'
    })

    expect(mockSend).toHaveBeenCalledWith(
      'new-recorded-command',
      expect.stringContaining('browser.element')
    )
  })

  it('does not send when command is empty (unmapped key)', () => {
    recorderEvent({
      action: 'sendKeys',
      selector: '#btn',
      strategy: 'css',
      tagName: 'BUTTON',
      value: 'UnknownKey'
    })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends type command with value', () => {
    recorderEvent({
      action: 'type',
      selector: '#input',
      strategy: 'css',
      tagName: 'INPUT',
      value: 'hello world'
    })

    expect(mockSend).toHaveBeenCalledWith(
      'new-recorded-command',
      expect.stringContaining('hello world')
    )
  })
})
