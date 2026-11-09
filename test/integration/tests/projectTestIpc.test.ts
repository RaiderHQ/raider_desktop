import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

const mockSafeExec = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))
vi.mock('../../../src/main/utils/safeExec', () => ({ safeExec: mockSafeExec }))

import setActiveProject from '../../../src/main/handlers/project/setActiveProject'
import {
  convertToFlowHandler,
  flowsReadyHandler,
  getProjectLayoutHandler,
  listProjectFlowsHandler,
  listProjectTestsHandler,
  listedFiles,
  openCodeTestHandler,
  recordOverExampleHandler
} from '../../../src/main/handlers/tests/projectTestIpc'
import { appState } from '../../../src/main/handlers/appState'
import { saveRecordedFlow, saveRecordedTest } from '../../../src/main/handlers/tests/recordedTests'
import { readSidecar } from '../../../src/main/handlers/tests/sidecar'
import { loadRecordedTests } from '../../../src/main/handlers/tests/loadTests'
import type { Step } from '../../../src/shared/types/step'

let project: string
let outside: string

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-ipc-'))
  outside = await mkdtemp(join(tmpdir(), 'raider-ipc-out-'))
  await writeFile(join(project, 'Gemfile'), "gem 'rspec'\ngem 'selenium-webdriver'\n")
  await mkdir(join(project, 'spec'))
  await writeFile(
    join(project, 'spec', 'a_spec.rb'),
    "RSpec.describe 'A' do\n  it 'works' do\n    visit 'x'\n  end\nend\n"
  )
  await writeFile(join(outside, 'secret_spec.rb'), "it 'x' do\nend\n")
  await writeFile(join(project, 'other_spec.rb'), "it 'o' do\nend\n")
  await writeFile(join(project, 'helper.rb'), 'x = 1\n')
  await symlink(join(outside, 'secret_spec.rb'), join(project, 'spec', 'link_spec.rb'))
  mockSafeExec.mockReset()
  mockSafeExec.mockResolvedValue({ stdout: '{"examples":[]}', stderr: '', exitCode: 0 })
})

afterEach(async () => {
  await setActiveProject(null)
  await rm(project, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('project test IPC', () => {
  it('lists nothing and has no layout without a project', async () => {
    await setActiveProject(null)
    expect(await listProjectTestsHandler()).toEqual([])
    expect(await getProjectLayoutHandler()).toBeNull()
  })

  it('lists spec files and exposes the layout', async () => {
    await setActiveProject(project)
    const entries = await listProjectTestsHandler()
    expect(entries.map((e) => e.file)).toContain('spec/a_spec.rb')
    expect((await getProjectLayoutHandler())?.specPath).toBeTruthy()
  })

  it('listedFiles accepts listed files and rejects the request if any is not listed', async () => {
    await setActiveProject(project)
    expect((await listedFiles(['spec/a_spec.rb'])).files).toEqual(['spec/a_spec.rb'])
    await expect(listedFiles(['spec/a_spec.rb', 'other_spec.rb'])).rejects.toThrow(
      'Not a project test: other_spec.rb'
    )
    await expect(listedFiles(['spec/a_spec.rb', 3])).rejects.toThrow('Not a spec file')
  })

  it('open-code-test opens a listed file', async () => {
    await setActiveProject(project)
    const view = await openCodeTestHandler('spec/a_spec.rb')
    expect(view.examples[0].name).toBe('works')
  })

  it('open-code-test rejects path outside spec', async () => {
    await setActiveProject(project)
    for (const bad of [
      '../' + outside.split('/').pop() + '/secret_spec.rb',
      '../../etc/passwd_spec.rb',
      join(outside, 'secret_spec.rb'),
      'helper.rb',
      'spec/../helper_spec.rb',
      'spec/link_spec.rb',
      'spec/missing_spec.rb'
    ]) {
      await expect(openCodeTestHandler(bad), bad).rejects.toThrow()
    }
  })

  it('open-code-test rejects a safe spec file the scanner does not list', async () => {
    await setActiveProject(project)
    expect((await listProjectTestsHandler()).map((e) => e.file)).not.toContain('other_spec.rb')
    await expect(openCodeTestHandler('other_spec.rb')).rejects.toThrow(/Not a project test/)
  })

  it('open-code-test refuses without a project', async () => {
    await setActiveProject(null)
    await expect(openCodeTestHandler('spec/a_spec.rb')).rejects.toThrow()
  })

  it('record-over-example replaces the example in a listed file', async () => {
    await setActiveProject(project)
    mockSafeExec.mockResolvedValue({
      stdout: '[{"startLine":2,"endLine":4}]',
      stderr: '',
      exitCode: 0
    })
    const steps = [{ id: 's', kind: 'navigate', url: 'https://x.test' }]
    expect(await recordOverExampleHandler('spec/a_spec.rb', 'works', steps, 'ruby')).toEqual({
      success: true
    })
    expect(await readFile(join(project, 'spec', 'a_spec.rb'), 'utf-8')).toBe(
      "RSpec.describe 'A' do\n  it 'works' do\n    driver.navigate.to('https://x.test')\n  end\nend\n"
    )
  })

  it('record-over-example reports a name that is not unique', async () => {
    await setActiveProject(project)
    mockSafeExec.mockResolvedValue({
      stdout: '[{"startLine":2,"endLine":4},{"startLine":5,"endLine":6}]',
      stderr: '',
      exitCode: 0
    })
    expect(await recordOverExampleHandler('spec/a_spec.rb', 'works', [], 'ruby')).toEqual({
      success: false,
      error: 'notUnique',
      count: 2
    })
  })

  it('record-over-example refuses unlisted files and bad steps, writing nothing', async () => {
    await setActiveProject(project)
    for (const bad of ['other_spec.rb', 'spec/link_spec.rb', '../x_spec.rb']) {
      const result = await recordOverExampleHandler(bad, 'works', [], 'ruby')
      expect(result.success, bad).toBe(false)
    }
    const result = await recordOverExampleHandler(
      'spec/a_spec.rb',
      'works',
      [{ kind: 'x' }],
      'ruby'
    )
    expect(result.success).toBe(false)
    expect(mockSafeExec).not.toHaveBeenCalled()
    expect(await readFile(join(outside, 'secret_spec.rb'), 'utf-8')).toBe("it 'x' do\nend\n")
  })
})

describe('flows over IPC', () => {
  const setUpFlows = async (): Promise<void> => {
    await mkdir(join(project, 'flows'))
    await writeFile(join(project, 'flows', 'flow_helper.rb'), '# helper\n')
  }
  const nav: Step = { id: 'n1', kind: 'navigate', url: 'https://x.test/' }
  const check = (id: string): Step => ({
    id,
    kind: 'assert',
    check: 'displayed',
    element: { strategy: 'css', value: '#ok' }
  })
  const typed: Step = {
    id: 't1',
    kind: 'type',
    element: { strategy: 'css', value: '#hours' },
    text: '8',
    inputName: 'hours'
  }

  it('flows-ready says whether flows/flow_helper.rb is set up', async () => {
    await setActiveProject(project)
    expect(await flowsReadyHandler()).toBe(false)
    await setUpFlows()
    expect(await flowsReadyHandler()).toBe(true)
    await setActiveProject(null)
    expect(await flowsReadyHandler()).toBe(false)
  })

  it('lists flows with stem and inputs, and lets them run but never be recorded over', async () => {
    await setUpFlows()
    await setActiveProject(project)
    const made = await saveRecordedFlow(project, appState.layout!, {
      id: 'f1',
      name: 'Fill hours',
      url: 'https://x.test',
      steps: [nav, typed]
    })
    await writeFile(join(project, 'flows', 'manual_flow.rb'), "RSpec.describe 'Manual' do\nend\n")

    expect(await listProjectFlowsHandler()).toEqual([
      {
        name: 'Fill hours',
        file: 'flows/fill_hours_flow.rb',
        stem: 'fill_hours',
        ownership: 'recorded',
        testId: 'f1',
        inputs: [{ name: 'hours', default: '8' }]
      },
      {
        name: 'Manual',
        file: 'flows/manual_flow.rb',
        stem: 'manual',
        ownership: 'code',
        inputs: []
      }
    ])
    const tests = await listProjectTestsHandler()
    expect(tests.find((e) => e.file === made.file)?.kind).toBe('flow')
    expect(tests.find((e) => e.file === 'spec/a_spec.rb')?.kind).toBeUndefined()

    // Run validates through listedFiles: the flow file is a listed file
    expect((await listedFiles([made.file, 'flows/manual_flow.rb'])).files).toHaveLength(2)
    await expect(listedFiles(['flows/../spec/a_spec.rb'])).rejects.toThrow()
    // Opened read-only like a code test
    expect((await openCodeTestHandler('flows/manual_flow.rb')).file).toBe('flows/manual_flow.rb')
    // Never recorded over: that could put a check into a flow
    const before = await readFile(join(project, made.file), 'utf-8')
    const res = await recordOverExampleHandler(made.file, 'runs', [check('a1')], 'ruby')
    expect(res.success).toBe(false)
    expect(await readFile(join(project, made.file), 'utf-8')).toBe(before)
  })

  it('never runs a file a planted record names behind a linked flows/', async () => {
    await setUpFlows()
    await setActiveProject(project)
    const made = await saveRecordedFlow(project, appState.layout!, {
      id: 'f1',
      name: 'Fill hours',
      url: '',
      steps: [nav]
    })
    await rm(join(project, 'flows'), { recursive: true })
    await writeFile(join(outside, 'fill_hours_flow.rb'), 'puts 1\n')
    await symlink(outside, join(project, 'flows'))
    await expect(listedFiles([made.file])).rejects.toThrow('Not a project test')
  })

  describe('convert-to-flow', () => {
    const saveTest = async (steps: Step[]): Promise<string> => {
      const saved = await saveRecordedTest(project, appState.layout!, {
        id: 'orig',
        name: 'Book room',
        url: 'https://x.test',
        steps
      })
      appState.tests = new Map((await loadRecordedTests(project)).map((t) => [t.id, t]))
      return saved.file
    }

    it('returns has-checks with their ids and changes nothing', async () => {
      await setUpFlows()
      await setActiveProject(project)
      const file = await saveTest([nav, check('a1'), check('a2')])
      const before = await readFile(join(project, file), 'utf-8')

      expect(await convertToFlowHandler(project, { testId: 'orig' })).toEqual({
        success: false,
        error: 'has-checks',
        stepIds: ['a1', 'a2']
      })
      expect(await readdir(join(project, 'flows'))).toEqual(['flow_helper.rb'])
      expect(await readFile(join(project, file), 'utf-8')).toBe(before)
    })

    it('drops the checks in the copy only when asked, under a new id; the test stays', async () => {
      await setUpFlows()
      await setActiveProject(project)
      const file = await saveTest([nav, check('a1'), typed])
      const before = await readFile(join(project, file), 'utf-8')
      const record = await readSidecar(project, file)

      const result = await convertToFlowHandler(project, { testId: 'orig', dropChecks: true })
      if (!result.success) throw new Error(result.error)
      expect(result.test.id).not.toBe('orig')
      expect(result.test).toMatchObject({
        kind: 'flow',
        file: 'flows/book_room_flow.rb',
        name: 'Book room',
        inputs: [{ name: 'hours', default: '8' }]
      })
      expect(result.test.steps.map((s) => s.id)).toEqual(['n1', 't1'])
      expect(await readFile(join(project, file), 'utf-8')).toBe(before)
      expect(await readSidecar(project, file)).toEqual(record)
      expect(appState.tests.get(result.test.id)?.kind).toBe('flow')
      expect(appState.tests.get('orig')?.kind).toBeUndefined()
    })

    it('converts a test without checks straight away', async () => {
      await setUpFlows()
      await setActiveProject(project)
      await saveTest([nav])
      const result = await convertToFlowHandler(project, { testId: 'orig' })
      expect(result.success).toBe(true)
    })

    it('refuses a code-owned test, a flow, a project without flows, and bad payloads', async () => {
      await setActiveProject(project)
      const file = await saveTest([nav])
      expect(await convertToFlowHandler(project, { testId: 'orig' })).toEqual({
        success: false,
        error: 'Set up flows first: run raider flow init in this project.'
      })
      await setUpFlows()
      await writeFile(
        join(project, file),
        (await readFile(join(project, file), 'utf-8')) + '\n# x\nputs 1\n'
      )
      const owned = await convertToFlowHandler(project, { testId: 'orig' })
      expect(owned).toEqual({
        success: false,
        error: "This test was changed in code, so Raider can't save it as a flow."
      })
      const flow = await saveRecordedFlow(project, appState.layout!, {
        id: 'fl',
        name: 'F',
        url: '',
        steps: [nav]
      })
      expect(flow.kind).toBe('flow')
      expect((await convertToFlowHandler(project, { testId: 'fl' })).success).toBe(false)
      for (const bad of [
        null,
        'orig',
        [],
        { testId: 3 },
        { testId: '' },
        { testId: 'x'.repeat(201) },
        { testId: 'orig', dropChecks: 'yes' }
      ]) {
        expect(await convertToFlowHandler(project, bad)).toEqual({
          success: false,
          error: 'This test could not be saved as a flow.'
        })
      }
      expect((await convertToFlowHandler('/elsewhere', { testId: 'orig' })).success).toBe(false)
      expect(await readdir(join(project, 'flows'))).toEqual(['f_flow.rb', 'flow_helper.rb'])
    })
  })
})
