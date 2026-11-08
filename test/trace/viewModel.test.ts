import fs from 'fs'
import path from 'path'
import { describe, it, expect, vi } from 'vitest'
import {
  eventsForStep,
  fromRaiderTrace,
  fromRecorderTrace,
  rectOverlayStyle,
  shouldDrawRect,
  type TraceViewStep
} from '../../src/renderer/src/foundation/trace/viewModel'
import type { RaiderTraceIndex, TraceEntryResult } from '../../src/shared/types/raiderTrace'
import type { TraceStep } from '../../src/shared/types/traceStep'
import { fixtureIndex, runtimeFixtureIndex } from '../helpers/traceFixture'

const image = (name: string): TraceEntryResult => ({
  ok: true,
  kind: 'image',
  dataUrl: `data:image/jpeg;base64,${name}`
})

function readOk(): ReturnType<typeof vi.fn<(name: string) => Promise<TraceEntryResult>>> {
  return vi.fn(async (name: string): Promise<TraceEntryResult> => {
    if (name.endsWith('.html')) return { ok: true, kind: 'html', text: `<p>${name}</p>` }
    return image(name)
  })
}

const view = (index: RaiderTraceIndex = fixtureIndex(), read = readOk()) =>
  fromRaiderTrace(index, read)

const step = (index: RaiderTraceIndex, n: number) => index.steps.find((s) => s.index === n)!

// Width and height from a JPEG's SOF0/SOF2 header.
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2
  while (i < buf.length) {
    const marker = buf[i + 1]
    if (marker === 0xc0 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    }
    i += 2 + buf.readUInt16BE(i + 2)
  }
  throw new Error('no JPEG size')
}

describe('fromRaiderTrace', () => {
  it('builds the tree', () => {
    const v = view()
    expect(v.steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 9])
    expect(v.byId.get('step-7')!.children.map((s) => s.number)).toEqual([8])
    expect(v.byId.get('step-9')!.children.map((s) => s.number)).toEqual([10])
    expect(v.byId.get('step-9')!.stepIndices).toEqual([9, 10])
    expect(v.byId.get('step-2')!.stepIndices).toEqual([2])
    expect(v.byId.size).toBe(10)
    expect(v.devicePixelRatio).toBe(1)
  })

  it('ids and numbers', () => {
    const s = view().byId.get('step-2')!
    expect(s.id).toBe('step-2')
    expect(s.number).toBe(2)
    expect(s.offsetMs).toBe(
      Date.parse('2026-11-02T00:48:34.491Z') - Date.parse('2026-11-02T00:48:34.420Z')
    )
    expect(s.offsetMs).toBe(71)
    expect(s.waitedMs).toBe(76)
    expect(s.title).toMatchObject({ key: 'traceViewer.step.typeSecret' })
    expect(s.foundBy).toMatchObject({ key: expect.stringMatching(/^traceViewer\.foundBy\./) })
    expect(s.raw).toEqual(step(fixtureIndex(), 2))
    expect(view().byId.get('step-6')!.retries).toBe(1)
  })

  it('gives offset 0 when a time is missing', () => {
    const index = fixtureIndex()
    index.startedAtMs = null
    expect(view(index).byId.get('step-2')!.offsetMs).toBe(0)
  })

  it('never gives a negative offset', () => {
    const index = fixtureIndex()
    step(index, 2).startedAtMs = index.startedAtMs! - 500
    expect(view(index).byId.get('step-2')!.offsetMs).toBe(0)
    const recorder = fromRecorderTrace(
      [
        { id: 'a', command: 'x', timestamp: 1000, url: 'u' },
        { id: 'b', command: 'y', timestamp: 900, url: 'u' }
      ],
      async () => ({ success: false })
    )
    expect(recorder.map((s) => s.offsetMs)).toEqual([0, 0])
  })

  it('builds a safe tree from a bad index on its own', () => {
    const base = step(fixtureIndex(), 7)
    const make = (index: number, parentIndex: number | null, kind = 'group') => ({
      ...base,
      index,
      parentIndex,
      kind
    })
    const index = {
      ...fixtureIndex(),
      network: [],
      console: [],
      steps: [
        make(1, 1), // its own parent
        make(2, 3), // a 2-cycle: 2 -> 3 -> 2
        make(3, 2),
        make(4, 99), // missing parent
        make(5, 6), // later parent
        make(6, null),
        make(7, null, 'action'),
        make(8, 7, 'action'), // parent is not a group
        make(3, null) // duplicate index
      ]
    }
    const v = view(index)
    expect(v.steps.map((s) => s.number)).toEqual([1, 2, 4, 5, 6, 7, 8])
    expect(v.byId.get('step-2')!.children.map((s) => s.number)).toEqual([3])
    expect(v.byId.get('step-2')!.stepIndices).toEqual([2, 3])
    expect(v.byId.get('step-1')!.stepIndices).toEqual([1])
    expect(v.byId.get('step-3')!.children).toEqual([])
    expect(v.byId.size).toBe(8)
  })

  it('status', () => {
    const index = fixtureIndex()
    step(index, 3).status = 'skipped'
    const v = view(index)
    expect(v.byId.get('step-9')!.status).toBe('failed')
    expect(v.byId.get('step-9')!.isGroup).toBe(true)
    expect(v.byId.get('step-2')!.status).toBe('passed')
    expect(v.byId.get('step-2')!.isGroup).toBe(false)
    expect(v.byId.get('step-3')!.status).toBe('other')
  })

  it('selects the deepest failed step', () => {
    expect(view().defaultSelectedId).toBe('step-9')

    const nested = fixtureIndex()
    step(nested, 10).status = 'failed'
    expect(view(nested).defaultSelectedId).toBe('step-10')

    const passing = fixtureIndex()
    for (const s of passing.steps) s.status = 'passed'
    expect(view(passing).defaultSelectedId).toBe('step-9')

    expect(view({ ...fixtureIndex(), steps: [], network: [], console: [] }).defaultSelectedId).toBe(
      null
    )
  })

  it('loads lazily, once', async () => {
    const read = readOk()
    const v = view(fixtureIndex(), read)
    expect(read).not.toHaveBeenCalled()

    const s2 = v.byId.get('step-2')!
    expect(s2.hasScreenshot).toBe(true)
    const shot = { stepId: 'step-2', dataUrl: 'data:image/jpeg;base64,steps/0002.jpg' }
    expect(await s2.loadScreenshot!()).toEqual(shot)
    expect(await s2.loadScreenshot!()).toEqual(shot)
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('steps/0002.jpg')

    expect(s2.hasSnapshot).toBe(true)
    expect(await s2.loadSnapshot!()).toEqual({
      stepId: 'step-2',
      snapshot: { kind: 'html', text: '<p>steps/0002.html</p>' }
    })

    const s4 = v.byId.get('step-4')!
    expect(s4.hasScreenshot).toBe(false)
    expect(s4.loadScreenshot).toBeUndefined()
    expect(s4.hasSnapshot).toBe(false)
    expect(s4.loadSnapshot).toBeUndefined()
  })

  it('does not cache a failed read', async () => {
    const read = vi
      .fn<(name: string) => Promise<TraceEntryResult>>()
      .mockResolvedValueOnce({ ok: false, error: 'damaged' })
      .mockResolvedValueOnce(image('again'))
    const s2 = view(fixtureIndex(), read).byId.get('step-2')!
    expect(await s2.loadScreenshot!()).toBeNull()
    expect(await s2.loadScreenshot!()).toMatchObject({ dataUrl: 'data:image/jpeg;base64,again' })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('gives null for a read that throws, and retries it later', async () => {
    const read = vi
      .fn<(name: string) => Promise<TraceEntryResult>>()
      .mockRejectedValueOnce(new Error('ipc gone'))
      .mockResolvedValueOnce(image('again'))
    const s2 = view(fixtureIndex(), read).byId.get('step-2')!
    expect(await s2.loadScreenshot!()).toBeNull()
    expect(await s2.loadScreenshot!()).toMatchObject({ dataUrl: 'data:image/jpeg;base64,again' })
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('tags each loaded entry with the step it was for', async () => {
    const index = fixtureIndex()
    step(index, 3).screenshot = step(index, 2).screenshot
    const read = readOk()
    const v = view(index, read)
    expect(await v.byId.get('step-2')!.loadScreenshot!()).toMatchObject({ stepId: 'step-2' })
    expect(await v.byId.get('step-3')!.loadScreenshot!()).toMatchObject({ stepId: 'step-3' })
    expect(read).toHaveBeenCalledTimes(1)
    const recorder = fromRecorderTrace(
      [{ id: 'r1', command: 'visit', timestamp: 1, url: 'u', screenshotPath: '/a.png' }],
      async () => ({ success: true, data: 'QUJD' })
    )
    expect(await recorder[0].loadScreenshot!()).toMatchObject({ stepId: 'r1' })
  })

  it('gives null for an entry of the wrong kind', async () => {
    const read = vi.fn(
      async (): Promise<TraceEntryResult> => ({ ok: true, kind: 'html', text: 'x' })
    )
    expect(await view(fixtureIndex(), read).byId.get('step-2')!.loadScreenshot!()).toBeNull()
    const read2 = vi.fn(async (): Promise<TraceEntryResult> => image('x'))
    expect(await view(fixtureIndex(), read2).byId.get('step-2')!.loadSnapshot!()).toBeNull()
  })

  it('keeps the error message of a secret step in raw only, but names the field', () => {
    const index = fixtureIndex()
    const s = step(index, 2)
    expect(s.secret).toBe(true)
    s.status = 'failed'
    s.element = { tag: 'input', label: 'Password', role: 'textbox' }
    s.error = { className: 'Boom', message: 'hunter2 was rejected' }
    const v = view(index).byId.get('step-2')!
    const { raw, ...shown } = v
    expect(JSON.stringify(shown)).not.toContain('hunter2')
    expect(raw!.error!.message).toContain('hunter2')
    expect(raw!.value).toBeNull()
    expect(v.title).toMatchObject({
      key: 'traceViewer.step.typeSecret',
      element: { values: { label: 'Password' } }
    })
  })
})

describe('shouldDrawRect', () => {
  it('rect only when the url is unchanged', () => {
    const index = fixtureIndex()
    expect(shouldDrawRect(step(index, 2), step(index, 1))).toBe(true)
    expect(view(index).byId.get('step-2')!.rect).toEqual(step(index, 2).rect)

    const moved = fixtureIndex()
    step(moved, 1).url = 'http://127.0.0.1:55539/login'
    expect(shouldDrawRect(step(moved, 2), step(moved, 1))).toBe(false)
    expect(view(moved).byId.get('step-2')!.rect).toBeNull()

    expect(shouldDrawRect({ ...step(index, 2) }, undefined)).toBe(false)
    const first = fixtureIndex()
    first.steps = first.steps.slice(1)
    expect(view(first).byId.get('step-2')!.rect).toBeNull()

    expect(shouldDrawRect({ ...step(index, 2), rect: null }, step(index, 1))).toBe(false)
    expect(view(index).byId.get('step-4')!.rect).toBeNull()
  })
})

describe('rectOverlayStyle', () => {
  const rect = { x: 8, y: 79.875, width: 153, height: 21 }
  const expectStyle = (style: Record<string, string>) => {
    for (const v of Object.values(style)) expect(v.endsWith('%')).toBe(true)
    expect(parseFloat(style.left)).toBeCloseTo(0.4167, 3)
    expect(parseFloat(style.top)).toBeCloseTo(8.5245, 3)
    expect(parseFloat(style.width)).toBeCloseTo(7.9687, 3)
    expect(parseFloat(style.height)).toBeCloseTo(2.2412, 3)
  }

  it('scales by the image, not the viewport', () => {
    expectStyle(rectOverlayStyle(rect, 1, { width: 1920, height: 937 })!)
    expectStyle(rectOverlayStyle(rect, 2, { width: 3840, height: 1874 })!)
  })

  it('places the fixture rect on the fixture screenshot', () => {
    const file = path.join(__dirname, '..', 'fixtures', 'trace-v1', 'unzipped', 'steps', '0002.jpg')
    const natural = jpegSize(fs.readFileSync(file))
    expect(natural).toEqual({ width: 1920, height: 937 }) // the viewport was 1920x1080
    const index = fixtureIndex()
    const s2 = view(index).byId.get('step-2')!
    const style = rectOverlayStyle(s2.rect!, index.devicePixelRatio, natural)!
    expect(parseFloat(style.top)).toBeCloseTo((79.875 / 937) * 100, 3)
    expect(parseFloat(style.top)).not.toBeCloseTo((79.875 / 1080) * 100, 1)
    expect(parseFloat(style.height)).not.toBeCloseTo((21 / 1080) * 100, 2)
  })

  it('gives no rect for an unusable size or ratio', () => {
    for (const dpr of [0, -1, NaN, Infinity]) {
      expect(rectOverlayStyle(rect, dpr, { width: 1920, height: 937 })).toBeNull()
    }
    expect(rectOverlayStyle(rect, 1, { width: 0, height: 937 })).toBeNull()
    expect(rectOverlayStyle(rect, 1, { width: 1920, height: 0 })).toBeNull()
    expect(rectOverlayStyle({ ...rect, x: NaN }, 1, { width: 1920, height: 937 })).toBeNull()
  })

  it('clamps the rect to the image', () => {
    const style = rectOverlayStyle({ x: -10, y: 900, width: 2000, height: 100 }, 1, {
      width: 1920,
      height: 937
    })!
    expect(parseFloat(style.left)).toBe(0)
    expect(parseFloat(style.width)).toBe(100)
    expect(parseFloat(style.top)).toBeCloseTo((900 / 937) * 100, 3)
    expect(parseFloat(style.top) + parseFloat(style.height)).toBeCloseTo(100, 6)
  })
})

describe('eventsForStep', () => {
  const index = fixtureIndex()
  const v = view(index)
  const at = (id: string): TraceViewStep => v.byId.get(id)!

  it('filters to the step', () => {
    expect(eventsForStep(index.network, at('step-6'), false).map((n) => n.url)).toEqual([
      'http://127.0.0.1:55539/api'
    ])
    expect(eventsForStep(index.console, at('step-6'), false).map((c) => c.text)).toEqual([
      'trace e2e error'
    ])
    expect(eventsForStep(index.network, at('step-2'), false)).toEqual([])
  })

  it('includes events of child steps', () => {
    const items = [
      { stepIndex: 10, text: 'child' },
      { stepIndex: 2, text: 'other' }
    ]
    expect(eventsForStep(items, at('step-9'), false).map((i) => i.text)).toEqual(['child'])
  })

  it('all, null step and orphans', () => {
    expect(eventsForStep(index.network, at('step-6'), true)).toHaveLength(3)
    expect(eventsForStep(index.network, null, false)).toEqual([])
    const items = [
      { stepIndex: null, text: 'orphan' },
      { stepIndex: 6, text: 'six' }
    ]
    expect(eventsForStep(items, at('step-6'), false).map((i) => i.text)).toEqual(['six'])
    expect(eventsForStep(items, null, true).map((i) => i.text)).toEqual(['orphan', 'six'])
  })
})

describe('fromRecorderTrace', () => {
  const recorded: TraceStep[] = [
    {
      id: 'a',
      command: 'visit',
      timestamp: 1000,
      url: 'https://x.test/',
      screenshotPath: '/s/a.png'
    },
    { id: 'b', command: 'click', timestamp: 1250, url: 'https://x.test/' }
  ]

  it('maps recorder steps', async () => {
    const readImage = vi.fn(async () => ({ success: true, data: 'QUJD', fileExt: 'png' }))
    const steps = fromRecorderTrace(recorded, readImage)
    expect(steps.map((s) => s.number)).toEqual([1, 2])
    expect(steps.map((s) => s.id)).toEqual(['a', 'b'])
    expect(steps.map((s) => s.offsetMs)).toEqual([0, 250])
    expect(steps[0].title).toBeUndefined()
    expect(steps[0].raw).toBeNull()
    expect(steps[0].rect).toBeNull()
    expect(readImage).not.toHaveBeenCalled()

    expect(steps[0].hasScreenshot).toBe(true)
    expect(await steps[0].loadScreenshot!()).toEqual({
      stepId: 'a',
      dataUrl: 'data:image/png;base64,QUJD'
    })
    await steps[0].loadScreenshot!()
    expect(readImage).toHaveBeenCalledTimes(1)
    expect(readImage).toHaveBeenCalledWith('/s/a.png')

    expect(steps[1].hasScreenshot).toBe(false)
    expect(steps[1].loadScreenshot).toBeUndefined()
  })

  it('defaults the extension to jpeg and gives null on failure', async () => {
    const ok = fromRecorderTrace(recorded, async () => ({ success: true, data: 'QUJD' }))
    expect(await ok[0].loadScreenshot!()).toMatchObject({ dataUrl: 'data:image/jpeg;base64,QUJD' })
    const bad = fromRecorderTrace(recorded, async () => ({ success: false, error: 'gone' }))
    expect(await bad[0].loadScreenshot!()).toBeNull()
  })
})

describe('fromRaiderTrace on a 4.0.0 runtime trace', () => {
  it('is a flat list of actions with their waits and locators', () => {
    const v = view(runtimeFixtureIndex())
    expect(v.steps.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6])
    expect(v.steps.every((s) => !s.isGroup && s.children.length === 0)).toBe(true)
    expect(v.steps.every((s) => s.status === 'passed')).toBe(true)
    expect(v.steps[0].foundBy).toBeNull()
    expect(v.steps[1].foundBy?.key).toBe('traceViewer.foundBy.label')
    expect(v.steps[5].foundBy?.key).toBe('traceViewer.foundBy.role')
    expect(v.steps[5].waitedMs).toBeGreaterThan(0)
    expect(v.steps[5].title?.key).toBe('traceViewer.step.click')
    expect(v.steps.every((s) => s.hasScreenshot && s.hasSnapshot)).toBe(true)
    // A passing trace selects its last step
    expect(v.defaultSelectedId).toBe('step-6')
  })
})
