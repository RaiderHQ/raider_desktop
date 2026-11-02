import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolveFailedStep, failedStepLine } from '../src/renderer/src/hooks/useFailedStep'
import type { Test } from '@shared/types/test'
import type { TestResult } from '@foundation/Types/testResult'

const save = { strategy: 'id' as const, value: 'save', label: 'Save' }
const test: Test = {
  id: 't1',
  name: 'Checkout',
  url: 'https://x.test',
  file: 'spec/checkout_spec.rb',
  ownership: 'recorded',
  steps: [
    { id: 'a', kind: 'navigate', url: 'https://x.test' },
    { id: 'b', kind: 'navigate', url: 'https://x.test/cart' },
    { id: 'c', kind: 'click', element: save }
  ]
}

const failed: TestResult = {
  name: 'Checkout',
  status: 'failed',
  file: 'spec/checkout_spec.rb',
  finishedAt: '2026-11-02T10:00:00Z',
  failure: {
    message: 'Unable to locate element',
    exceptionClass: 'Selenium::WebDriver::Error::NoSuchElementError',
    backtrace: ['spec/checkout_spec.rb:9:in `block`'],
    appFrame: 'spec/checkout_spec.rb:9:in `block`'
  }
}

const mapFailedStep = vi.fn()

beforeEach(() => {
  mapFailedStep.mockReset()
  window.api = { mapFailedStep } as unknown as typeof window.api
})

describe('resolveFailedStep', () => {
  it('gives the mapped step, its index and the plain reason', async () => {
    mapFailedStep.mockResolvedValue({ stepId: 'c', index: 2 })
    const state = await resolveFailedStep('/p', test, failed)
    expect(state).toMatchObject({ status: 'mapped', index: 2, step: test.steps[2], result: failed })
    expect(state.status === 'mapped' && state.reason.key).toBe('failedStep.reason.notFound')
    expect(mapFailedStep).toHaveBeenCalledWith('/p', 't1', {
      file: 'spec/checkout_spec.rb',
      backtrace: failed.failure!.backtrace,
      appFrame: failed.failure!.appFrame,
      finishedAt: '2026-11-02T10:00:00Z'
    })
  })

  it('gives unmapped for noMap and outsideSteps', async () => {
    mapFailedStep.mockResolvedValue({ none: 'noMap' })
    expect(await resolveFailedStep('/p', test, failed)).toEqual({
      status: 'unmapped',
      result: failed
    })
    mapFailedStep.mockResolvedValue({ none: 'outsideSteps' })
    expect((await resolveFailedStep('/p', test, failed)).status).toBe('unmapped')
  })

  it('gives changedSinceRun', async () => {
    mapFailedStep.mockResolvedValue({ none: 'changedSinceRun' })
    expect(await resolveFailedStep('/p', test, failed)).toEqual({
      status: 'changedSinceRun',
      result: failed
    })
  })

  it('gives none for an edited or unrecorded test', async () => {
    mapFailedStep.mockResolvedValue({ none: 'edited' })
    expect(await resolveFailedStep('/p', test, failed)).toEqual({ status: 'none' })
    mapFailedStep.mockResolvedValue({ none: 'notRecorded' })
    expect(await resolveFailedStep('/p', test, failed)).toEqual({ status: 'none' })
  })

  it('gives none for a passed result, without asking main', async () => {
    const passed = { ...failed, status: 'passed' }
    expect(await resolveFailedStep('/p', test, passed)).toEqual({ status: 'none' })
    expect(mapFailedStep).not.toHaveBeenCalled()
  })

  it('gives none for a result without a failure', async () => {
    const { failure: _failure, ...bare } = failed
    expect(await resolveFailedStep('/p', test, bare)).toEqual({ status: 'none' })
    expect(mapFailedStep).not.toHaveBeenCalled()
  })

  it('gives none for a test the user wrote in code', async () => {
    expect(await resolveFailedStep('/p', { ...test, ownership: 'code' }, failed)).toEqual({
      status: 'none'
    })
    expect(mapFailedStep).not.toHaveBeenCalled()
  })
})

describe('failedStepLine', () => {
  const t = ((key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key) as Parameters<typeof failedStepLine>[0]

  it('names the step and the reason for a mapped failure', async () => {
    mapFailedStep.mockResolvedValue({ stepId: 'c', index: 2 })
    const state = await resolveFailedStep('/p', test, failed)
    expect(failedStepLine(t, state)).toBe(
      'failedStep.title {"n":3,"step":"recorder.commandParser.clickElement {\\"element\\":\\"Save\\"}"}. ' +
        'failedStep.reason.notFound {"element":"\\"Save\\""}'
    )
  })

  it('gives the plain line for unmapped and changed, and null for none', () => {
    expect(failedStepLine(t, { status: 'unmapped', result: failed })).toBe('failedStep.unmapped')
    expect(failedStepLine(t, { status: 'changedSinceRun', result: failed })).toBe(
      'failedStep.changedSinceRun'
    )
    expect(failedStepLine(t, { status: 'none' })).toBeNull()
  })
})
