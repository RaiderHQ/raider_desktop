import { describe, it, expect, vi, afterEach } from 'vitest'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const testTracesDir = join(tmpdir(), 'raider-test-delete-' + randomUUID())

vi.mock('electron', () => ({
  app: {
    getPath: () => testTracesDir
  }
}))

import deleteTrace from '../../src/main/handlers/trace/deleteTrace'

describe('deleteTrace handler', () => {
  afterEach(() => {
    if (existsSync(testTracesDir)) {
      rmSync(testTracesDir, { recursive: true, force: true })
    }
  })

  it('deletes trace JSON file', async () => {
    const testId = 'test-' + randomUUID()
    const tracesDir = join(testTracesDir, 'traces')
    mkdirSync(tracesDir, { recursive: true })

    const jsonPath = join(tracesDir, `${testId}.trace.json`)
    writeFileSync(jsonPath, '[]', 'utf-8')
    expect(existsSync(jsonPath)).toBe(true)

    await deleteTrace(testId)
    expect(existsSync(jsonPath)).toBe(false)
  })

  it('deletes trace screenshot directory', async () => {
    const testId = 'test-' + randomUUID()
    const tracesDir = join(testTracesDir, 'traces')
    const testTraceDir = join(tracesDir, testId)
    mkdirSync(testTraceDir, { recursive: true })

    writeFileSync(join(testTraceDir, 'step-1.jpg'), 'fake-image')
    writeFileSync(join(testTraceDir, 'step-2.jpg'), 'fake-image')

    expect(existsSync(testTraceDir)).toBe(true)

    await deleteTrace(testId)
    expect(existsSync(testTraceDir)).toBe(false)
  })

  it('deletes both JSON and screenshot directory', async () => {
    const testId = 'test-' + randomUUID()
    const tracesDir = join(testTracesDir, 'traces')
    const testTraceDir = join(tracesDir, testId)
    mkdirSync(testTraceDir, { recursive: true })

    const jsonPath = join(tracesDir, `${testId}.trace.json`)
    writeFileSync(jsonPath, '[]', 'utf-8')
    writeFileSync(join(testTraceDir, 'step-1.jpg'), 'fake-image')

    await deleteTrace(testId)

    expect(existsSync(jsonPath)).toBe(false)
    expect(existsSync(testTraceDir)).toBe(false)
  })

  it('does not throw when files do not exist', async () => {
    const testId = 'nonexistent-' + randomUUID()
    await expect(deleteTrace(testId)).resolves.not.toThrow()
  })
})
