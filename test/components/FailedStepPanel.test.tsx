import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import FailedStepPanel from '@components/FailedStepPanel'
import type { FailedStepState } from '../../src/renderer/src/hooks/useFailedStep'
import type { Test } from '@shared/types/test'
import type { Step } from '@shared/types/step'
import type { TestResult } from '@foundation/Types/testResult'
import en from '@assets/translations/en.json'

vi.mock('react-router', () => ({ useNavigate: (): (() => void) => vi.fn() }))

// The English copy, interpolated, so the test reads what the user reads
vi.mock('react-i18next', async () => {
  const strings = (await import('@assets/translations/en.json')).default
  const lookup = (key: string): unknown =>
    key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], strings)
  const t = (key: string, values: Record<string, unknown> = {}): string => {
    const text = lookup(key)
    if (typeof text !== 'string') return key
    return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''))
  }
  return { useTranslation: (): { t: typeof t } => ({ t }) }
})

const save: Step = {
  id: 'c',
  kind: 'click',
  element: { strategy: 'css', value: '#save-btn', label: 'Save' }
}
const test: Test = {
  id: 't1',
  name: 'Checkout',
  url: 'https://x.test',
  file: 'spec/checkout_spec.rb',
  ownership: 'recorded',
  steps: [
    { id: 'a', kind: 'navigate', url: 'https://x.test' },
    { id: 'b', kind: 'navigate', url: 'https://x.test/cart' },
    save
  ]
}

const result: TestResult = {
  name: 'Checkout',
  status: 'failed',
  file: 'spec/checkout_spec.rb',
  screenshot: '/p/raider-results/attachments/shot.png',
  failure: {
    message: 'Unable to locate element: #save-btn',
    exceptionClass: 'Selenium::WebDriver::Error::NoSuchElementError',
    backtrace: ['spec/checkout_spec.rb:9:in `block`'],
    appFrame: 'spec/checkout_spec.rb:9:in `block`'
  }
}

const mapped = (r: TestResult = result): FailedStepState => ({
  status: 'mapped',
  index: 2,
  step: save,
  reason: { key: 'failedStep.reason.notFound', params: { element: '"Save"' } },
  result: r
})

const loadTrace = vi.fn()
const readImage = vi.fn(async (path: string) => ({
  success: true,
  data: 'AAAA',
  fileExt: path.slice(path.lastIndexOf('.'))
}))

beforeEach(() => {
  vi.clearAllMocks()
  loadTrace.mockResolvedValue({
    success: true,
    trace: [
      { id: 'tr1', stepId: 'b', command: '', timestamp: 1, url: '', screenshotPath: '/t/b.jpg' },
      { id: 'tr2', stepId: 'c', command: '', timestamp: 2, url: '', screenshotPath: '/t/c.jpg' }
    ]
  })
  window.api = {
    loadTrace,
    readImage,
    readFile: vi.fn().mockResolvedValue({ success: false })
  } as unknown as typeof window.api
})

const renderPanel = (
  state: FailedStepState,
  actions: React.ReactNode = null,
  extra: Partial<React.ComponentProps<typeof FailedStepPanel>> = {}
): void => {
  render(
    <FailedStepPanel
      state={state}
      test={test}
      projectPath="/p"
      readOnly={false}
      actions={actions}
      {...extra}
    />
  )
}

describe('FailedStepPanel', () => {
  it('names the failed step and says why in plain words', async () => {
    renderPanel(mapped())
    expect(screen.getByText('Failed at step 3: Click "Save"')).toBeInTheDocument()
    expect(screen.getByText('Couldn\'t find "Save".')).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
  })

  it('shows the recorded picture of that step beside the one from the run', async () => {
    renderPanel(mapped())
    const recorded = within(screen.getByTestId('picture-recorded'))
    const failed = within(screen.getByTestId('picture-failed'))
    expect(recorded.getByText(en.failedStep.whenRecorded)).toBeInTheDocument()
    expect(failed.getByText(en.failedStep.whenFailed)).toBeInTheDocument()
    expect((await recorded.findByRole('img')).getAttribute('src')).toMatch(/^data:image\/jpeg/)
    expect((await failed.findByRole('img')).getAttribute('src')).toMatch(/^data:image\/png/)
    expect(loadTrace).toHaveBeenCalledWith('t1')
    expect(readImage).toHaveBeenCalledWith('/t/c.jpg')
    expect(readImage).not.toHaveBeenCalledWith('/t/b.jpg')
  })

  it('says so when either picture is missing', async () => {
    loadTrace.mockResolvedValue({ success: true, trace: [] })
    const { screenshot: _shot, ...noShot } = result
    renderPanel(mapped(noShot))
    expect(
      await screen.findByText('No picture from the recording for this step')
    ).toBeInTheDocument()
    expect(screen.getByText('No picture from this run')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('keeps the technical details folded away', async () => {
    renderPanel(mapped())
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2))
    const details = screen.getByTestId('technical-details')
    expect(details).not.toHaveAttribute('open')
    expect(screen.getByText(result.failure!.exceptionClass!)).not.toBeVisible()
    expect(screen.getByText(result.failure!.message)).not.toBeVisible()
    fireEvent.click(within(details).getByText('Technical details'))
    expect(details).toHaveAttribute('open')
    expect(screen.getByText(result.failure!.exceptionClass!)).toBeVisible()
  })

  it('shows the fix buttons it is given', () => {
    renderPanel(mapped(), <button>Edit value</button>)
    expect(screen.getByRole('button', { name: 'Edit value' })).toBeInTheDocument()
  })

  it('says it could not tell the step, with only the run picture', async () => {
    renderPanel({ status: 'unmapped', result })
    expect(screen.getByText("Couldn't tell which step failed")).toBeInTheDocument()
    expect((await screen.findByRole('img')).getAttribute('src')).toMatch(/^data:image\/png/)
    expect(screen.queryByTestId('picture-recorded')).not.toBeInTheDocument()
    expect(loadTrace).not.toHaveBeenCalled()
    expect(screen.getByTestId('technical-details')).toBeInTheDocument()
  })

  it('asks for a new run when the test changed since', () => {
    renderPanel({ status: 'changedSinceRun', result })
    expect(
      screen.getByText('This test changed after its last run. Run it again to see where it fails.')
    ).toBeInTheDocument()
  })

  describe('editing a value', () => {
    const typed: Step = {
      id: 'c',
      kind: 'type',
      element: { strategy: 'css', value: '#q' },
      text: 'a'
    }
    const secret: Step = { ...typed, text: '', secret: true }
    const navStep: Step = { id: 'c', kind: 'navigate', url: 'https://x.test/cart' }
    const stateFor = (step: Step): FailedStepState => ({ ...mapped(), step }) as FailedStepState

    it.each([
      ['typed text', typed],
      ['a visit', navStep]
    ])('offers Edit value for %s', (_name, step) => {
      const onEditValue = vi.fn()
      renderPanel(stateFor(step), null, { onEditValue })
      fireEvent.click(screen.getByRole('button', { name: en.failedStep.editValue }))
      expect(onEditValue).toHaveBeenCalled()
    })

    it('never offers Edit value for a secret', () => {
      renderPanel(stateFor(secret), null, { onEditValue: vi.fn() })
      expect(
        screen.queryByRole('button', { name: en.failedStep.editValue })
      ).not.toBeInTheDocument()
    })

    it('has no Edit value for a click, or in a read-only test', () => {
      renderPanel(mapped(), null, { onEditValue: vi.fn() })
      expect(
        screen.queryByRole('button', { name: en.failedStep.editValue })
      ).not.toBeInTheDocument()
    })

    it('says it is fixed in place of the failure, and runs again from there', () => {
      const onRunAgain = vi.fn()
      renderPanel(stateFor(typed), null, { fixed: true, onEditValue: vi.fn(), onRunAgain })
      expect(screen.getByRole('heading', { name: en.failedStep.fixed })).toBeInTheDocument()
      expect(screen.queryByText(/^Failed at step/)).not.toBeInTheDocument()
      expect(screen.getByTestId('failed-step-panel').className).not.toContain('red')
      expect(
        screen.queryByRole('button', { name: en.failedStep.editValue })
      ).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: en.failedStep.runAgain }))
      expect(onRunAgain).toHaveBeenCalled()
    })
  })

  describe('Re-record from here', () => {
    it('asks to re-record from the failed step', () => {
      const onReRecord = vi.fn()
      renderPanel(mapped(), null, { onReRecord })
      fireEvent.click(screen.getByRole('button', { name: en.failedStep.reRecord }))
      expect(onReRecord).toHaveBeenCalledWith(2)
    })

    it('starts from the first step when the failed step is not known', () => {
      const onReRecord = vi.fn()
      renderPanel({ status: 'unmapped', result }, null, { onReRecord })
      fireEvent.click(screen.getByRole('button', { name: en.failedStep.reRecord }))
      expect(onReRecord).toHaveBeenCalledWith(0)
    })

    it('is not offered in a read-only test', () => {
      renderPanel(mapped(), null, { onReRecord: vi.fn(), readOnly: true })
      expect(screen.queryByRole('button', { name: en.failedStep.reRecord })).not.toBeInTheDocument()
    })
  })
})
