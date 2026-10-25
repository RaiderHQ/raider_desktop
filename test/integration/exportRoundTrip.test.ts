import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockDialog = vi.hoisted(() => ({ showSaveDialog: vi.fn(), showOpenDialog: vi.fn() }))
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: () => ({}) },
  dialog: mockDialog
}))

import { appState } from '../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../src/main/handlers/config/projectSettings'
import * as persistence from '../../src/main/handlers/suitePersistence'
import exportTest from '../../src/main/handlers/io/exportTest'
import exportSuite from '../../src/main/handlers/io/exportSuite'
import importTest from '../../src/main/handlers/io/importTest'
import importSuite from '../../src/main/handlers/io/importSuite'
import { readExportHeader, writeExportHeader } from '../../src/main/codegen/exportHeader'
import type { Step } from '../../src/shared/types/step'
import type { Suite } from '../../src/shared/types/suite'

const steps: Step[] = [
  { id: 'n', kind: 'navigate', url: 'https://x.test' },
  {
    id: 't',
    kind: 'type',
    element: { strategy: 'id', value: 'q', label: 'Search' },
    text: 'a\nb "c"'
  },
  { id: 'k', kind: 'pressKey', element: { strategy: 'id', value: 'q' }, key: 'Enter' },
  { id: 'a', kind: 'assert', check: 'titleEquals', expected: 'Results' },
  { id: 'c', kind: 'custom', code: 'puts "hi" # comment\nputs 2' }
]
const win = { webContents: { send: vi.fn() } } as never

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'roundtrip-'))
  appState.suites = new Map()
  appState.projectAutomation = 'watir'
  appState.projectFramework = 'rspec'
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
  vi.spyOn(persistence, 'persistActiveSuites').mockResolvedValue()
})
afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

describe('export then import round trips', () => {
  it('a test', async () => {
    const file = join(dir, 'search.rb')
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: file })
    expect((await exportTest({ testName: 'Search', steps })).success).toBe(true)

    const text = await readFile(file, 'utf-8')
    expect(text.startsWith('# Test: Search\n# raider-steps: ')).toBe(true)
    expect(text).toContain("require 'watir'")

    appState.suites = new Map([['s1', { id: 's1', name: 'S', tests: [] }]])
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] })
    const res = await importTest(win, 's1')
    expect(res.test!.name).toBe('Search')
    expect(res.test!.steps).toEqual(steps)
  })

  it('a suite', async () => {
    const suite: Suite = {
      id: 'orig',
      name: 'Checkout',
      tests: [
        { id: 't1', name: 'Pay', url: '', steps },
        { id: 't2', name: 'Cancel', url: '', steps: [steps[0]] }
      ]
    }
    appState.suites = new Map([['orig', suite]])
    const out = join(dir, 'checkout')
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })
    expect((await exportSuite('orig')).success).toBe(true)
    expect(await readFile(join(out, 'pay.rb'), 'utf-8')).toContain('# Suite: Checkout\n')

    appState.suites = new Map()
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [out] })
    const res = await importSuite(win)
    const withoutIds = (list: Step[]): unknown[] =>
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      list.map(({ id: _id, ...rest }) => rest)
    const byName = Object.fromEntries(res.suite!.tests.map((t) => [t.name, t.steps]))
    expect(withoutIds(byName.Pay)).toEqual(withoutIds(steps))
    expect(withoutIds(byName.Cancel)).toEqual(withoutIds([steps[0]]))
    // Both tests share the navigate step's id; whichever imports second gets a fresh one
    const ids = res.suite!.tests.flatMap((t) => t.steps.map((s) => s.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect((await readdir(out)).sort()).toEqual(['cancel.rb', 'pay.rb'])
  })

  it('importTest gives fresh ids to steps already used in the target suite', async () => {
    const file = join(dir, 'dup.rb')
    await writeFile(file, writeExportHeader({ testName: 'Dup', steps: [steps[0]] }))
    appState.suites = new Map([
      ['s1', { id: 's1', name: 'S', tests: [{ id: 'x', name: 'X', url: '', steps: [steps[0]] }] }]
    ])
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] })
    const res = await importTest(win, 's1')
    expect(res.test!.steps[0].id).not.toBe('n')
  })

  it('a legacy begin…puts file still imports', async () => {
    const legacyDir = join(dir, 'legacy')
    await mkdir(legacyDir)
    await writeFile(
      join(legacyDir, 'old.rb'),
      '# Test: Old\nbegin\n  @driver.get("https://x.test")\n  puts "Test \'Old\' passed successfully!"\n'
    )
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [legacyDir] })
    const res = await importSuite(win)
    expect(res.suite!.tests[0]).toMatchObject({
      name: 'Old',
      steps: [{ kind: 'navigate', url: 'https://x.test' }]
    })
  })
})

describe('readExportHeader', () => {
  it('falls back to the legacy body when the steps JSON is malformed', () => {
    const text =
      '# Test: Broken\n# raider-steps: [{"id": oops\nbegin\n  @driver.get("https://y.test")\n  puts "Test \'Broken\' passed successfully!"\n'
    const header = readExportHeader(text)
    expect(header.testName).toBe('Broken')
    expect(header.steps).toEqual([
      { id: expect.any(String), kind: 'navigate', url: 'https://y.test' }
    ])
  })

  it('returns no steps for malformed JSON without a legacy body', () => {
    expect(readExportHeader('# raider-steps: {nope').steps).toBeUndefined()
  })

  it('keeps only valid steps from the JSON line', () => {
    const line = `# raider-steps: ${JSON.stringify([steps[0], { id: 'z', kind: 'click' }, 'x'])}`
    expect(readExportHeader(line).steps).toEqual([steps[0]])
  })

  it('keeps names on one line', () => {
    const header = writeExportHeader({ testName: 'a\nb', suiteName: 'c\r\nd', steps: [] })
    expect(readExportHeader(header)).toEqual({ testName: 'a b', suiteName: 'c d', steps: [] })
  })
})
