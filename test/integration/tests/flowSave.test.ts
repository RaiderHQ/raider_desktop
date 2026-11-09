import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, symlink, access } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  saveRecordedFlow,
  saveRecordedTest,
  findSidecarById,
  stepLinesFor,
  deleteRecordedTest,
  flowsReady,
  flowInputsOf,
  CodeOwnedError,
  FlowIdError,
  FlowIdTakenError,
  FlowInputClashError,
  FlowRecordsUnsafeError,
  FlowsNotReadyError
} from '../../../src/main/handlers/tests/recordedTests'
import { FlowHasChecksError, generateFlowFileWithMap } from '../../../src/main/codegen/flowFile'
import { readSidecar, writeSidecar } from '../../../src/main/handlers/tests/sidecar'
import { loadRecordedTests } from '../../../src/main/handlers/tests/loadTests'
import { listProjectTests } from '../../../src/main/handlers/tests/listProjectTests'
import { migrateRecordedTests } from '../../../src/main/handlers/tests/migrateRecordedTests'
import { CODEGEN_VERSION } from '../../../src/main/codegen/testFile'
import type { ProjectLayout } from '../../../src/shared/types/projectLayout'
import type { Test } from '../../../src/shared/types/test'
import type { Step } from '../../../src/shared/types/step'

let project: string
let outside: string

const layout: ProjectLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: true
}

const nav = (id = 's0'): Step => ({ id, kind: 'navigate', url: 'https://x.test/' })
const typing = (id: string, inputName: string, text: string): Step => ({
  id,
  kind: 'type',
  element: { strategy: 'css', value: '#hours' },
  text,
  inputName
})
const check = (id = 'a1'): Step => ({
  id,
  kind: 'assert',
  check: 'displayed',
  element: { strategy: 'css', value: '#x' }
})

const flow = (over: Partial<Test> = {}): Test => ({
  id: 'f1',
  name: 'Fill timesheet',
  url: 'https://x.test',
  steps: [nav()],
  ...over
})

const exists = (p: string): Promise<boolean> =>
  access(p).then(
    () => true,
    () => false
  )

async function setUpFlows(): Promise<void> {
  await mkdir(join(project, 'flows'), { recursive: true })
  await writeFile(join(project, 'flows', 'flow_helper.rb'), '# helper\n')
}

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-flows-'))
  outside = await mkdtemp(join(tmpdir(), 'raider-outside-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(project, { recursive: true, force: true })
  await rm(outside, { recursive: true, force: true })
})

describe('saveRecordedFlow', () => {
  it('writes flows/<stem>_flow.rb at the project root and a flow record with its inputs', async () => {
    await setUpFlows()
    const steps = [nav(), typing('t1', 'hours', '8'), typing('t2', 'hours', '8')]
    const saved = await saveRecordedFlow(project, layout, flow({ steps }))

    expect(saved.file).toBe('flows/fill_timesheet_flow.rb')
    expect(saved.kind).toBe('flow')
    // Two steps may share an input when they type the same value: one input
    expect(saved.inputs).toEqual([{ name: 'hours', default: '8' }])
    const content = await readFile(join(project, 'flows', 'fill_timesheet_flow.rb'), 'utf-8')
    expect(content).toBe(generateFlowFileWithMap({ name: 'Fill timesheet', steps }, {}).content)
    expect(content).toContain("require_relative 'flow_helper'")
    expect(await exists(join(project, 'spec'))).toBe(false)
    const record = await readSidecar(project, 'flows/fill_timesheet_flow.rb')
    expect(record).toMatchObject({ kind: 'flow', inputs: [{ name: 'hours', default: '8' }] })
    expect(record?.stepLines?.ranges.map((r) => r.stepId)).toEqual(['s0', 't1', 't2'])
  })

  it('names files by the gem rule: env, long names, ../ and unicode', async () => {
    await setUpFlows()
    const env = await saveRecordedFlow(project, layout, flow({ id: 'a', name: 'Env' }))
    expect(env.file).toBe('flows/env_flow_flow.rb')

    const long = 'x'.repeat(80)
    const first = await saveRecordedFlow(project, layout, flow({ id: 'b', name: long }))
    const second = await saveRecordedFlow(project, layout, flow({ id: 'c', name: long }))
    expect(first.file).toBe(`flows/${'x'.repeat(60)}_flow.rb`)
    expect(second.file).toBe(`flows/${'x'.repeat(58)}_2_flow.rb`)

    const dots = await saveRecordedFlow(
      project,
      layout,
      flow({ id: 'd', name: '../../etc/passwd' })
    )
    expect(dots.file).toBe('flows/etc_passwd_flow.rb')

    const unicode = await saveRecordedFlow(project, layout, flow({ id: 'e', name: '日本語' }))
    expect(unicode.file).toBe('flows/recorded_flow_flow.rb')
    const accents = await saveRecordedFlow(project, layout, flow({ id: 'g', name: 'Café ölçü' }))
    expect(accents.file).toBe('flows/cafe_olcu_flow.rb')

    const files = (await readdir(join(project, 'flows'))).sort()
    expect(files).toContain('env_flow_flow.rb')
    expect(await exists(join(outside, 'passwd_flow.rb'))).toBe(false)
  })

  it('refuses a flow when flows/ is a symlink leaving the project', async () => {
    await writeFile(join(outside, 'flow_helper.rb'), '# helper\n')
    await symlink(outside, join(project, 'flows'))

    await expect(saveRecordedFlow(project, layout, flow())).rejects.toBeInstanceOf(
      FlowsNotReadyError
    )
    expect(await readdir(outside)).toEqual(['flow_helper.rb'])
    expect(await flowsReady(project)).toBe(false)
  })

  it('refuses a flow when flows/ is a symlink even inside the project', async () => {
    await mkdir(join(project, 'real'))
    await writeFile(join(project, 'real', 'flow_helper.rb'), '# helper\n')
    await symlink(join(project, 'real'), join(project, 'flows'))
    await expect(saveRecordedFlow(project, layout, flow())).rejects.toBeInstanceOf(
      FlowsNotReadyError
    )
  })

  it('refuses a missing or symlinked flow_helper.rb, with the set-up message', async () => {
    await mkdir(join(project, 'flows'))
    const missing = saveRecordedFlow(project, layout, flow())
    await expect(missing).rejects.toBeInstanceOf(FlowsNotReadyError)
    await expect(saveRecordedFlow(project, layout, flow())).rejects.toThrow(
      'Set up flows first: run raider flow init in this project.'
    )

    await writeFile(join(outside, 'flow_helper.rb'), '# helper\n')
    await symlink(join(outside, 'flow_helper.rb'), join(project, 'flows', 'flow_helper.rb'))
    await expect(saveRecordedFlow(project, layout, flow())).rejects.toBeInstanceOf(
      FlowsNotReadyError
    )
    expect(await readdir(join(project, 'flows'))).toEqual(['flow_helper.rb'])
    expect(await exists(join(project, '.raider'))).toBe(false)
  })

  it('refuses a helper that is a folder', async () => {
    await mkdir(join(project, 'flows', 'flow_helper.rb'), { recursive: true })
    expect(await flowsReady(project)).toBe(false)
  })

  it('refuses a check and writes nothing', async () => {
    await setUpFlows()
    const error = await saveRecordedFlow(project, layout, flow({ steps: [nav(), check()] })).catch(
      (e: unknown) => e
    )
    expect(error).toBeInstanceOf(FlowHasChecksError)
    expect((error as FlowHasChecksError).stepIds).toEqual(['a1'])
    expect(await readdir(join(project, 'flows'))).toEqual(['flow_helper.rb'])
  })

  it('refuses two steps that share an input with different values, and writes nothing', async () => {
    await setUpFlows()
    const steps = [nav(), typing('t1', 'hours', '8'), typing('t2', 'hours', '9')]
    const error = await saveRecordedFlow(project, layout, flow({ steps })).catch(
      (e: unknown) => e
    )
    expect(error).toBeInstanceOf(FlowInputClashError)
    expect((error as Error).message).toBe('Two steps use the input hours with different values.')
    expect(await readdir(join(project, 'flows'))).toEqual(['flow_helper.rb'])

    // An existing flow keeps its file when an edit makes a clash
    const saved = await saveRecordedFlow(
      project,
      layout,
      flow({ steps: [nav(), typing('t1', 'hours', '8'), typing('t2', 'hours', '8')] })
    )
    const before = await readFile(join(project, saved.file), 'utf-8')
    await expect(saveRecordedFlow(project, layout, flow({ steps }))).rejects.toBeInstanceOf(
      FlowInputClashError
    )
    expect(await readFile(join(project, saved.file), 'utf-8')).toBe(before)
  })

  it('updates an existing flow in place and keeps kind and inputs', async () => {
    await setUpFlows()
    const first = await saveRecordedFlow(project, layout, flow())
    const steps = [nav(), typing('t1', 'hours', '8')]
    const updated = await saveRecordedFlow(project, layout, flow({ steps }))

    expect(updated.file).toBe(first.file)
    expect(updated.createdAt).toBe(first.createdAt)
    const record = await readSidecar(project, first.file)
    expect(record).toMatchObject({ kind: 'flow', inputs: [{ name: 'hours', default: '8' }] })
    expect(await readFile(join(project, first.file), 'utf-8')).toContain("flow_input('hours', '8')")

    // Inputs come from the steps alone: removing the input drops it
    const plain = await saveRecordedFlow(project, layout, flow({ steps: [nav()] }))
    expect(plain.kind).toBe('flow')
    expect(plain).not.toHaveProperty('inputs')
  })

  it('renames an untitled flow once it gets a real name, inside flows/', async () => {
    await setUpFlows()
    const first = await saveRecordedFlow(project, layout, flow({ name: 'Untitled Test' }))
    expect(first.file).toBe('flows/untitled_test_flow.rb')
    const named = await saveRecordedFlow(project, layout, flow({ name: 'Book room' }))
    expect(named.file).toBe('flows/book_room_flow.rb')
    expect(named.kind).toBe('flow')
    expect((await readdir(join(project, 'flows'))).sort()).toEqual([
      'book_room_flow.rb',
      'flow_helper.rb'
    ])
    expect(await readSidecar(project, 'flows/untitled_test_flow.rb')).toBeNull()
  })

  it('makes an edited flow code-owned and never rewrites it', async () => {
    await setUpFlows()
    const first = await saveRecordedFlow(project, layout, flow())
    const file = join(project, first.file)
    await writeFile(file, (await readFile(file, 'utf-8')) + '\nputs "hand"\n')

    await expect(saveRecordedFlow(project, layout, flow({ name: 'Other' }))).rejects.toBeInstanceOf(
      CodeOwnedError
    )
    expect(await readFile(file, 'utf-8')).toContain('puts "hand"')
    expect(await readSidecar(project, first.file)).toMatchObject({ codeOwned: true, kind: 'flow' })
  })

  it('restores a missing flow file without making flows/', async () => {
    await setUpFlows()
    const first = await saveRecordedFlow(project, layout, flow())
    await rm(join(project, first.file))
    await saveRecordedFlow(project, layout, flow({ name: 'Fill timesheet' }))
    expect(await exists(join(project, first.file))).toBe(true)
  })

  it('refuses an id a test holds, and the spec writer refuses a flow id', async () => {
    await setUpFlows()
    await saveRecordedTest(project, layout, { ...flow(), id: 'shared' })
    await expect(saveRecordedFlow(project, layout, flow({ id: 'shared' }))).rejects.toBeInstanceOf(
      FlowIdTakenError
    )

    await saveRecordedFlow(project, layout, flow({ id: 'mine' }))
    await expect(
      saveRecordedTest(project, layout, { ...flow(), id: 'mine' })
    ).rejects.toBeInstanceOf(FlowIdError)
    // Even with a known spec path (no full scan)
    await expect(
      saveRecordedTest(project, layout, { ...flow(), id: 'mine' }, { knownFile: null })
    ).rejects.toBeInstanceOf(FlowIdError)
  })

  it('fails closed on a duplicate id held by a test and a flow', async () => {
    await setUpFlows()
    const test = await saveRecordedTest(project, layout, { ...flow(), id: 'dup' })
    const made = await saveRecordedFlow(project, layout, flow({ id: 'other' }))
    // A copy of the flow's record under the test's id
    await writeSidecar(project, { ...made, id: 'dup' })

    await expect(saveRecordedFlow(project, layout, flow({ id: 'dup' }))).rejects.toBeInstanceOf(
      FlowIdTakenError
    )
    await expect(
      saveRecordedTest(
        project,
        layout,
        { ...flow(), id: 'dup', name: 'X' },
        { knownFile: test.file }
      )
    ).rejects.toBeInstanceOf(FlowIdTakenError)
    // Loading keeps the first record found
    const loaded = await loadRecordedTests(project)
    expect(loaded.filter((t) => t.id === 'dup')).toHaveLength(1)
  })

  it('never writes spec code into flows/: a record at a flow path is a flow whatever its kind', async () => {
    await setUpFlows()
    const made = await saveRecordedFlow(project, layout, flow())
    const asTest = { ...made }
    delete asTest.kind
    delete asTest.inputs
    await writeSidecar(project, asTest)
    const before = await readFile(join(project, made.file), 'utf-8')

    await expect(
      saveRecordedTest(project, layout, flow({ name: 'Changed' }), { knownFile: made.file })
    ).rejects.toBeInstanceOf(FlowIdError)
    await expect(
      saveRecordedTest(project, layout, flow({ name: 'Changed' }))
    ).rejects.toBeInstanceOf(FlowIdError)
    expect(await readFile(join(project, made.file), 'utf-8')).toBe(before)
    // It loads as a flow, and the flow writer puts its kind back
    expect((await loadRecordedTests(project))[0].kind).toBe('flow')
    const fixed = await saveRecordedFlow(project, layout, flow({ name: 'Changed' }))
    expect(fixed.kind).toBe('flow')
  })

  it('refuses a record that calls itself a flow at a spec path, in both writers', async () => {
    await setUpFlows()
    const test = await saveRecordedTest(project, layout, flow())
    await writeSidecar(project, { ...test, kind: 'flow' })
    await expect(saveRecordedTest(project, layout, flow({ name: 'Y' }))).rejects.toBeInstanceOf(
      FlowIdError
    )
    await expect(saveRecordedFlow(project, layout, flow({ name: 'Y' }))).rejects.toBeInstanceOf(
      FlowIdTakenError
    )
  })

  it('a flow is found, mapped and deleted like a test', async () => {
    await setUpFlows()
    const made = await saveRecordedFlow(project, layout, flow({ steps: [nav(), nav('s1')] }))
    expect((await findSidecarById(project, 'f1'))?.file).toBe(made.file)

    const lines = await stepLinesFor(project, layout, 'f1')
    expect('stepLines' in lines && lines.stepLines?.ranges.map((r) => r.stepId)).toEqual([
      's0',
      's1'
    ])

    // A record without a map gets one derived by the flow codegen
    const bare = { ...made }
    delete bare.stepLines
    await writeSidecar(project, bare)
    const derived = await stepLinesFor(project, layout, 'f1')
    expect('stepLines' in derived && derived.stepLines?.ranges).toHaveLength(2)

    await deleteRecordedTest(project, 'f1')
    expect(await exists(join(project, made.file))).toBe(false)
    expect(await readSidecar(project, made.file)).toBeNull()
  })

  it('serializes with test saves of the same id', async () => {
    await setUpFlows()
    const [a, b] = await Promise.allSettled([
      saveRecordedFlow(project, layout, flow({ id: 'race' })),
      saveRecordedTest(project, layout, { ...flow(), id: 'race' })
    ])
    expect(a.status).toBe('fulfilled')
    expect(b.status).toBe('rejected')
    expect(await exists(join(project, 'spec'))).toBe(false)
  })
})

describe('flowInputsOf', () => {
  it('a test save drops input names: only a flow reads inputs', async () => {
    const steps = [nav(), typing('t1', 'hours', '8')]
    const saved = await saveRecordedTest(project, layout, flow({ id: 'x1', name: 'Plain', steps }))

    expect(saved.steps[1]).not.toHaveProperty('inputName')
    expect(saved).not.toHaveProperty('inputs')
    const record = await readSidecar(project, saved.file)
    expect(record?.steps[1]).not.toHaveProperty('inputName')
    expect(await readFile(join(project, saved.file), 'utf-8')).not.toContain('flow_input')

    // Saving the same steps again keeps the file as it is (nothing to strip any more)
    const again = await saveRecordedTest(project, layout, flow({ id: 'x1', name: 'Plain', steps }))
    expect(again.updatedAt).toBe(saved.updatedAt)
  })

  it('rebuilds inputs from the steps on every flow save: rename, add, remove', async () => {
    await setUpFlows()
    const first = await saveRecordedFlow(
      project,
      layout,
      flow({ steps: [nav(), typing('t1', 'hours', '8')] })
    )
    expect(first.inputs).toEqual([{ name: 'hours', default: '8' }])
    const renamed = await saveRecordedFlow(
      project,
      layout,
      flow({ steps: [nav(), typing('t1', 'days', '8'), typing('t2', 'note', 'hi')] })
    )
    expect(renamed.inputs).toEqual([
      { name: 'days', default: '8' },
      { name: 'note', default: 'hi' }
    ])
    expect(await readFile(join(project, renamed.file), 'utf-8')).toContain(
      "flow_input('days', '8')"
    )
  })

  it('never makes an input of a secret', () => {
    const secret = { ...typing('t1', 'pw', 'x'), secret: true } as Step
    expect(flowInputsOf([secret])).toEqual([])
  })
})

describe('flows in the project', () => {
  it('load puts flows in the snapshot with kind flow and their inputs', async () => {
    await setUpFlows()
    await saveRecordedFlow(project, layout, flow({ steps: [nav(), typing('t1', 'hours', '8')] }))
    await saveRecordedTest(project, layout, { ...flow(), id: 't1', name: 'Login' })
    const loaded = await loadRecordedTests(project)
    const byId = Object.fromEntries(loaded.map((t) => [t.id, t]))
    expect(byId.f1).toMatchObject({
      kind: 'flow',
      file: 'flows/fill_timesheet_flow.rb',
      ownership: 'recorded',
      inputs: [{ name: 'hours', default: '8' }]
    })
    expect(byId.t1.kind).toBeUndefined()
  })

  it('lists flow files (recorded and hand-written), never subfolders or symlinks', async () => {
    await setUpFlows()
    await saveRecordedFlow(project, layout, flow())
    await writeFile(join(project, 'flows', 'manual_flow.rb'), "RSpec.describe 'Manual' do\nend\n")
    await writeFile(join(project, 'flows', 'env_flow.rb'), '# reserved\n')
    await mkdir(join(project, 'flows', 'sub'))
    await writeFile(join(project, 'flows', 'sub', 'deep_flow.rb'), '')
    await writeFile(join(outside, 'x_flow.rb'), '')
    await symlink(join(outside, 'x_flow.rb'), join(project, 'flows', 'linked_flow.rb'))

    const entries = await listProjectTests(project, layout)
    expect(entries.map((e) => [e.file, e.ownership, e.kind])).toEqual([
      ['flows/fill_timesheet_flow.rb', 'recorded', 'flow'],
      ['flows/manual_flow.rb', 'code', 'flow']
    ])
    expect(entries[0].testId).toBe('f1')
  })

  it('migrate rewrites a flow with the flow codegen, never as a spec', async () => {
    await setUpFlows()
    const made = await saveRecordedFlow(project, layout, flow())
    // An older shape: the record says an older codegen and the file is stale
    await writeSidecar(project, { ...made, codegen: CODEGEN_VERSION - 1 })
    const count = await migrateRecordedTests(project, { ...layout, testIdAttribute: 'data-qa' })
    expect(count).toBe(1)
    const record = await readSidecar(project, made.file)
    expect(record).toMatchObject({ kind: 'flow', codegen: CODEGEN_VERSION })
    expect(await readFile(join(project, made.file), 'utf-8')).toContain('flow: true do')
    expect(await exists(join(project, 'spec'))).toBe(false)
  })

  it('a forced regenerate (test id attribute change) rewrites a flow by the flow codegen', async () => {
    await setUpFlows()
    const step: Step = {
      id: 'c1',
      kind: 'click',
      element: {
        strategy: 'css',
        value: '[data-testid="save"]',
        locator: { by: 'testId', attribute: 'data-testid', value: 'save' }
      }
    }
    const made = await saveRecordedFlow(project, layout, flow({ steps: [step] }))
    const before = await readFile(join(project, made.file), 'utf-8')
    const next = { ...layout, testIdAttribute: 'data-qa' }
    await migrateRecordedTests(project, next, { force: true })
    const expected = generateFlowFileWithMap(
      { name: made.name, steps: made.steps },
      { testIdAttribute: 'data-qa' }
    ).content
    expect(expected).not.toBe(before)
    expect(await readFile(join(project, made.file), 'utf-8')).toBe(expected)
    expect((await readSidecar(project, made.file))?.kind).toBe('flow')
  })

  it('migrate leaves flows alone when flows are not set up', async () => {
    await setUpFlows()
    const made = await saveRecordedFlow(project, layout, flow())
    await writeSidecar(project, { ...made, codegen: CODEGEN_VERSION - 1 })
    await rm(join(project, 'flows', 'flow_helper.rb'))
    const before = await readFile(join(project, made.file), 'utf-8')
    expect(await migrateRecordedTests(project, layout)).toBe(0)
    expect(await readFile(join(project, made.file), 'utf-8')).toBe(before)
  })
})

describe('the flow records folder', () => {
  const records = (): string => join(project, '.raider', 'tests', 'flows')

  it('refuses a flow save when .raider/tests/flows is a link, every time, without making files', async () => {
    await setUpFlows()
    await mkdir(join(project, 'elsewhere'))
    await mkdir(join(project, '.raider', 'tests'), { recursive: true })
    await symlink(join(project, 'elsewhere'), records())

    for (let i = 0; i < 2; i++) {
      await expect(saveRecordedFlow(project, layout, flow())).rejects.toBeInstanceOf(
        FlowRecordsUnsafeError
      )
    }
    expect(await readdir(join(project, 'flows'))).toEqual(['flow_helper.rb'])
    expect(await readdir(join(project, 'elsewhere'))).toEqual([])
  })

  it('refuses a flow save when .raider or .raider/tests is a link, or the folder is a file', async () => {
    await setUpFlows()
    await mkdir(join(project, 'real-raider'))
    await symlink(join(project, 'real-raider'), join(project, '.raider'))
    await expect(saveRecordedFlow(project, layout, flow())).rejects.toBeInstanceOf(
      FlowRecordsUnsafeError
    )
    await rm(join(project, '.raider'))
    await mkdir(join(project, '.raider', 'tests'), { recursive: true })
    await writeFile(records(), 'not a folder')
    await expect(saveRecordedFlow(project, layout, flow())).rejects.toBeInstanceOf(
      FlowRecordsUnsafeError
    )
    expect(await readdir(join(project, 'flows'))).toEqual(['flow_helper.rb'])
  })

  it('never blocks a test save: a dangling or outside link there holds no flow records', async () => {
    await mkdir(join(project, '.raider', 'tests'), { recursive: true })
    await symlink(join(project, 'nowhere'), records())
    const first = await saveRecordedTest(project, layout, { ...flow(), id: 't1', name: 'Login' })
    expect(first.file).toBe('spec/login_spec.rb')
    const again = await saveRecordedTest(project, layout, { ...flow(), id: 't1', name: 'Login' })
    expect(again.id).toBe('t1')

    await rm(records())
    await symlink(outside, records())
    const second = await saveRecordedTest(project, layout, { ...flow(), id: 't2', name: 'Cart' })
    expect(second.file).toBe('spec/cart_spec.rb')
  })
})

describe('listing a flow named by a record', () => {
  it('skips a record whose flow file sits behind a linked flows/', async () => {
    await setUpFlows()
    const made = await saveRecordedFlow(project, layout, flow())
    // Move the flow out and link flows/ to where it went; the record stays
    await rm(join(project, 'flows'), { recursive: true })
    await writeFile(join(outside, 'fill_timesheet_flow.rb'), 'puts 1\n')
    await symlink(outside, join(project, 'flows'))

    const entries = await listProjectTests(project, layout)
    expect(entries.map((e) => e.file)).not.toContain(made.file)
  })

  it('skips a record whose flow file is a link, and keeps one whose file is missing', async () => {
    await setUpFlows()
    const linked = await saveRecordedFlow(project, layout, flow({ id: 'a', name: 'Linked' }))
    const gone = await saveRecordedFlow(project, layout, flow({ id: 'b', name: 'Gone' }))
    await rm(join(project, linked.file))
    await writeFile(join(outside, 'x.rb'), 'puts 1\n')
    await symlink(join(outside, 'x.rb'), join(project, linked.file))
    await rm(join(project, gone.file))

    const entries = await listProjectTests(project, layout)
    expect(entries.map((e) => e.file)).not.toContain(linked.file)
    expect(entries.find((e) => e.file === gone.file)).toMatchObject({ missingFile: true })
  })
})
