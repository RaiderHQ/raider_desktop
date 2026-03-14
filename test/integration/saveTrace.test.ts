import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import type { TraceStep } from '../../src/renderer/src/foundation/Types/traceStep'

const testTracesDir = join(tmpdir(), 'raider-test-traces-' + randomUUID())
const mockSend = vi.fn()

vi.mock('electron', () => ({
  app: {
    getPath: () => testTracesDir
  }
}))

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    suites: new Map(),
    mainWindow: {
      webContents: {
        send: (...args: unknown[]) => mockSend(...args)
      }
    }
  }
}))

import saveTrace from '../../src/main/handlers/trace/saveTrace'
import { appState } from '../../src/main/handlers/appState'

describe('saveTrace handler', () => {
  const testId = 'test-' + randomUUID()

  beforeEach(() => {
    vi.clearAllMocks()
    appState.suites = new Map()
  })

  afterEach(() => {
    if (existsSync(testTracesDir)) {
      rmSync(testTracesDir, { recursive: true, force: true })
    }
  })

  it('saves trace JSON to the correct path', async () => {
    const trace: TraceStep[] = [
      {
        id: 'step-1',
        command: '@driver.get("https://example.com")',
        timestamp: Date.now(),
        url: 'https://example.com'
      }
    ]

    const result = await saveTrace(testId, trace)

    expect(result.success).toBe(true)
    const jsonPath = join(testTracesDir, 'traces', `${testId}.trace.json`)
    expect(existsSync(jsonPath)).toBe(true)

    const savedData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    expect(savedData).toHaveLength(1)
    expect(savedData[0].command).toBe('@driver.get("https://example.com")')
  })

  it('copies screenshots to trace directory', async () => {
    // Create a fake screenshot file
    const srcDir = join(tmpdir(), 'raider-src-' + randomUUID())
    mkdirSync(srcDir, { recursive: true })
    const srcScreenshot = join(srcDir, 'shot.jpg')
    writeFileSync(srcScreenshot, 'fake-image-data')

    const trace: TraceStep[] = [
      {
        id: 'step-1',
        command: '@driver.find_element(:id, "btn").click',
        timestamp: Date.now(),
        url: 'https://example.com',
        screenshotPath: srcScreenshot
      }
    ]

    const result = await saveTrace(testId, trace)

    expect(result.success).toBe(true)

    // Verify screenshot was copied
    const destPath = join(testTracesDir, 'traces', testId, 'step-1.jpg')
    expect(existsSync(destPath)).toBe(true)
    expect(readFileSync(destPath, 'utf-8')).toBe('fake-image-data')

    // Verify JSON references the new path
    const jsonPath = join(testTracesDir, 'traces', `${testId}.trace.json`)
    const savedData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    expect(savedData[0].screenshotPath).toBe(destPath)

    rmSync(srcDir, { recursive: true, force: true })
  })

  it('skips missing screenshot files without failing', async () => {
    const trace: TraceStep[] = [
      {
        id: 'step-1',
        command: '@driver.get("https://example.com")',
        timestamp: Date.now(),
        url: 'https://example.com',
        screenshotPath: '/nonexistent/path/shot.jpg'
      }
    ]

    const result = await saveTrace(testId, trace)
    expect(result.success).toBe(true)
  })

  it('sets hasTrace flag on matching test in appState', async () => {
    const suite = {
      id: 'suite-1',
      name: 'Test Suite',
      tests: [{ id: testId, name: 'My Test', url: '', steps: [] }]
    }
    appState.suites.set('suite-1', suite)

    const trace: TraceStep[] = [
      {
        id: 'step-1',
        command: '@driver.get("https://example.com")',
        timestamp: Date.now(),
        url: 'https://example.com'
      }
    ]

    await saveTrace(testId, trace)

    const test = appState.suites.get('suite-1')?.tests.find((t) => t.id === testId)
    expect(test?.hasTrace).toBe(true)
  })

  it('broadcasts suite-updated after saving', async () => {
    const suite = {
      id: 'suite-1',
      name: 'Test Suite',
      tests: [{ id: testId, name: 'My Test', url: '', steps: [] }]
    }
    appState.suites.set('suite-1', suite)

    const trace: TraceStep[] = [
      {
        id: 'step-1',
        command: '@driver.get("https://example.com")',
        timestamp: Date.now(),
        url: 'https://example.com'
      }
    ]

    await saveTrace(testId, trace)

    expect(mockSend).toHaveBeenCalledWith('suite-updated', expect.any(Array))
  })

  it('handles multiple trace steps', async () => {
    const trace: TraceStep[] = [
      {
        id: 'step-1',
        command: '@driver.get("https://example.com")',
        timestamp: 1000,
        url: 'https://example.com'
      },
      {
        id: 'step-2',
        command: '@driver.find_element(:id, "btn").click',
        timestamp: 2000,
        url: 'https://example.com/page',
        elementInfo: {
          tagName: 'BUTTON',
          selector: '#btn',
          strategy: 'id',
          innerText: 'Click me'
        }
      },
      {
        id: 'step-3',
        command: '@driver.find_element(:css, "#input").send_keys("hello")',
        timestamp: 3000,
        url: 'https://example.com/page'
      }
    ]

    const result = await saveTrace(testId, trace)
    expect(result.success).toBe(true)

    const jsonPath = join(testTracesDir, 'traces', `${testId}.trace.json`)
    const savedData = JSON.parse(readFileSync(jsonPath, 'utf-8'))
    expect(savedData).toHaveLength(3)
    expect(savedData[1].elementInfo?.tagName).toBe('BUTTON')
  })
})
