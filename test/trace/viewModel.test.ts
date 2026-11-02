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
import { fixtureIndex } from '../helpers/traceFixture'

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
    expect(await s2.loadScreenshot!()).toBe('data:image/jpeg;base64,steps/0002.jpg')
    expect(await s2.loadScreenshot!()).toBe('data:image/jpeg;base64,steps/0002.jpg')
    expect(read).toHaveBeenCalledTimes(1)
    expect(read).toHaveBeenCalledWith('steps/0002.jpg')

    expect(s2.hasSnapshot).toBe(true)
    expect(await s2.loadSnapshot!()).toEqual({ kind: 'html', text: '<p>steps/0002.html</p>' })

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
    expect(await s2.loadScreenshot!()).toBe('data:image/jpeg;base64,again')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('gives null for an entry of the wrong kind', async () => {
    const read = vi.fn(
      async (): Promise<TraceEntryResult> => ({ ok: true, kind: 'html', text: 'x' })
    )
    expect(await view(fixtureIndex(), read).byId.get('step-2')!.loadScreenshot!()).toBeNull()
    const read2 = vi.fn(async (): Promise<TraceEntryResult> => image('x'))
    expect(await view(fixtureIndex(), read2).byId.get('step-2')!.loadSnapshot!()).toBeNull()
  })

  it('keeps a secret value out of every field but raw', () => {
    const index = fixtureIndex()
    const s = step(index, 2)
    s.element = { tag: 'input', label: 'Password', role: 'textbox' }
    s.error = { className: 'Boom', message: 'hunter2 was rejected' }
    const v = view(index).byId.get('step-2')!
    const { raw, ...shown } = v
    expect(JSON.stringify(shown)).not.toContain('hunter2')
    expect(raw!.error!.message).toContain('hunter2')
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
    expectStyle(rectOverlayStyle(rect, 1, { width: 1920, height: 937 }))
    expectStyle(rectOverlayStyle(rect, 2, { width: 3840, height: 1874 }))
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
    expect(await steps[0].loadScreenshot!()).toBe('data:image/png;base64,QUJD')
    await steps[0].loadScreenshot!()
    expect(readImage).toHaveBeenCalledTimes(1)
    expect(readImage).toHaveBeenCalledWith('/s/a.png')

    expect(steps[1].hasScreenshot).toBe(false)
    expect(steps[1].loadScreenshot).toBeUndefined()
  })

  it('defaults the extension to jpeg and gives null on failure', async () => {
    const ok = fromRecorderTrace(recorded, async () => ({ success: true, data: 'QUJD' }))
    expect(await ok[0].loadScreenshot!()).toBe('data:image/jpeg;base64,QUJD')
    const bad = fromRecorderTrace(recorded, async () => ({ success: false, error: 'gone' }))
    expect(await bad[0].loadScreenshot!()).toBeNull()
  })
})
