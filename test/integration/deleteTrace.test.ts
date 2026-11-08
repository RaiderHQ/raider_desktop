import { describe, it, expect, vi, afterEach } from 'vitest'
import { join } from 'path'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

// userData sits two levels inside its own sandbox, so even a broken guard with an id of
// '..' or '../..' could only reach folders this test made
const sandbox = join(tmpdir(), 'raider-test-delete-' + randomUUID())
const testTracesDir = join(sandbox, 'a', 'userData')

vi.mock('electron', () => ({
  app: {
    getPath: () => testTracesDir
  }
}))

import deleteTrace from '../../src/main/handlers/trace/deleteTrace'

describe('deleteTrace handler', () => {
  afterEach(() => {
    if (existsSync(sandbox)) {
      rmSync(sandbox, { recursive: true, force: true })
    }
  })

  // A test id can come from a sidecar in the project, which a cloned repo controls
  it.each(['..', '../..', '', '.', 'a/b', 'a\\b', '../outside'])(
    'refuses the unsafe test id %j and deletes nothing',
    async (testId) => {
      const tracesDir = join(testTracesDir, 'traces')
      mkdirSync(join(tracesDir, 'keep'), { recursive: true })
      writeFileSync(join(testTracesDir, 'other.json'), '{}')
      mkdirSync(join(testTracesDir, 'outside'), { recursive: true })
      await deleteTrace(testId)
      expect(existsSync(join(tracesDir, 'keep'))).toBe(true)
      expect(existsSync(join(testTracesDir, 'other.json'))).toBe(true)
      expect(existsSync(join(testTracesDir, 'outside'))).toBe(true)
      expect(existsSync(join(sandbox, 'a'))).toBe(true)
    }
  )

  it('refuses a test id that is not a string', async () => {
    await expect(deleteTrace(3 as unknown as string)).resolves.toBeUndefined()
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
