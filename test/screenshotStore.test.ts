import { describe, it, expect, beforeEach } from 'vitest'
import useScreenshotStore from '@foundation/Stores/screenshotStore'

describe('screenshotStore', () => {
  beforeEach(() => {
    useScreenshotStore.setState({ screenshotPaths: [] })
  })

  it('initializes with empty screenshot paths', () => {
    expect(useScreenshotStore.getState().screenshotPaths).toEqual([])
  })

  it('adds a screenshot path', () => {
    useScreenshotStore.getState().addScreenshotPath('/tmp/screenshot1.png')
    expect(useScreenshotStore.getState().screenshotPaths).toEqual(['/tmp/screenshot1.png'])
  })

  it('appends to existing paths', () => {
    useScreenshotStore.getState().addScreenshotPath('/tmp/a.png')
    useScreenshotStore.getState().addScreenshotPath('/tmp/b.png')
    expect(useScreenshotStore.getState().screenshotPaths).toEqual(['/tmp/a.png', '/tmp/b.png'])
  })

  it('clears all screenshot paths', () => {
    useScreenshotStore.getState().addScreenshotPath('/tmp/a.png')
    useScreenshotStore.getState().addScreenshotPath('/tmp/b.png')
    useScreenshotStore.getState().clearScreenshotPaths()
    expect(useScreenshotStore.getState().screenshotPaths).toEqual([])
  })
})
