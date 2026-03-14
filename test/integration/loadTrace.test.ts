import { describe, it, expect, vi, afterEach } from 'vitest'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const testTracesDir = join(tmpdir(), 'raider-test-load-' + randomUUID())

vi.mock('electron', () => ({
  app: {
    getPath: () => testTracesDir
  }
}))

import loadTrace from '../../src/main/handlers/trace/loadTrace'

describe('loadTrace handler', () => {
  afterEach(() => {
    if (existsSync(testTracesDir)) {
      rmSync(testTracesDir, { recursive: true, force: true })
    }
  })

  it('returns success false when trace file does not exist', async () => {
    const result = await loadTrace('nonexistent-test-id')
    expect(result.success).toBe(false)
    expect(result.trace).toBeUndefined()
  })

  it('loads and parses trace JSON correctly', async () => {
    const testId = 'test-' + randomUUID()
    const tracesDir = join(testTracesDir, 'traces')
    mkdirSync(tracesDir, { recursive: true })

    const traceData = [
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
        url: 'https://example.com',
        elementInfo: {
          tagName: 'BUTTON',
          selector: '#btn',
          strategy: 'id'
        }
      }
    ]

    writeFileSync(join(tracesDir, `${testId}.trace.json`), JSON.stringify(traceData), 'utf-8')

    const result = await loadTrace(testId)
    expect(result.success).toBe(true)
    expect(result.trace).toHaveLength(2)
    expect(result.trace![0].command).toBe('@driver.get("https://example.com")')
    expect(result.trace![1].elementInfo?.tagName).toBe('BUTTON')
  })

  it('returns success false for corrupted JSON', async () => {
    const testId = 'test-' + randomUUID()
    const tracesDir = join(testTracesDir, 'traces')
    mkdirSync(tracesDir, { recursive: true })

    writeFileSync(join(tracesDir, `${testId}.trace.json`), '{invalid json!!!', 'utf-8')

    const result = await loadTrace(testId)
    expect(result.success).toBe(false)
  })

  it('preserves screenshotPath references', async () => {
    const testId = 'test-' + randomUUID()
    const tracesDir = join(testTracesDir, 'traces')
    mkdirSync(tracesDir, { recursive: true })

    const traceData = [
      {
        id: 'step-1',
        command: '@driver.get("https://example.com")',
        timestamp: 1000,
        url: 'https://example.com',
        screenshotPath: '/some/path/step-1.jpg'
      }
    ]

    writeFileSync(join(tracesDir, `${testId}.trace.json`), JSON.stringify(traceData), 'utf-8')

    const result = await loadTrace(testId)
    expect(result.trace![0].screenshotPath).toBe('/some/path/step-1.jpg')
  })
})
