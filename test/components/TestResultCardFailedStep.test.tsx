import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import TestResultCard from '@components/TestResultCard'
import { testKeyOf, toRouteParam } from '@foundation/testKey'
import type { Test } from '@foundation/Types/test'
import type { TestResult } from '@foundation/Types/testResult'
import en from '@assets/translations/en.json'

const text = (key: string, values?: Record<string, unknown>): string => {
  const found = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], en)
  const raw = typeof found === 'string' ? found : key
  return raw.replace(/\{\{(\w+)\}\}/g, (_, k) => String(values?.[k] ?? ''))
}

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: typeof text } => ({ t: text })
}))

const navigate = vi.hoisted(() => vi.fn())
vi.mock('react-router', () => ({ useNavigate: (): typeof navigate => navigate }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))

const test1: Test = {
  id: 't1',
  name: 'Checkout',
  ownership: 'recorded',
  file: 'spec/a_spec.rb',
  steps: [
    { id: 'a', kind: 'navigate', url: 'https://x.test' },
    { id: 'b', kind: 'navigate', url: 'https://x.test/2' },
    { id: 'c', kind: 'navigate', url: 'https://x.test/3' },
    { id: 'd', kind: 'click', element: { label: 'Save', selectors: [] } }
  ]
} as unknown as Test

const result: TestResult = {
  name: 'Checkout',
  status: 'failed',
  file: 'spec/a_spec.rb',
  screenshot: '/p/raider-results/attachments/s.png',
  failure: {
    message: '{"method":"css selector","selector":"#btn-x"}',
    exceptionClass: 'Selenium::WebDriver::Error::NoSuchElementError',
    backtrace: ['spec/a_spec.rb:9:in `block`'],
    appFrame: 'spec/a_spec.rb:9'
  }
}

beforeEach(() => {
  navigate.mockReset()
  window.api = {
    readFile: vi.fn().mockResolvedValue({ success: false }),
    readImage: vi.fn().mockResolvedValue({ success: true, data: 'base64data', fileExt: 'png' }),
    mapFailedStep: vi.fn().mockResolvedValue({ stepId: 'd', index: 3 })
  } as unknown as typeof window.api
})

describe('TestResultCard for a recorded test', () => {
  const renderCard = (): void => {
    render(
      <TestResultCard
        name="Checkout"
        status="failed"
        screenshot={result.screenshot}
        failure={result.failure}
        projectPath="/p"
        result={result}
        recordedTest={test1}
      />
    )
    fireEvent.click(screen.getByText('Checkout'))
  }

  it('says which step failed in plain words, hiding the technical text', async () => {
    renderCard()
    const line = await screen.findByTestId('failed-step-line')
    expect(line).toHaveTextContent('Failed at step 4: Click "Save". Couldn\'t find "Save".')
    expect(screen.getByTestId('technical-details')).not.toHaveAttribute('open')
    // Only inside the closed Technical details, where nobody sees it
    const raw = screen.getAllByText(/#btn-x/)
    expect(raw.length).toBeGreaterThan(0)
    raw.forEach((el) => expect(el).not.toBeVisible())
    await waitFor(() => expect(screen.getByAltText('Failure screenshot')).toBeInTheDocument())
  })

  it('goes to the test page with Fix in test', async () => {
    renderCard()
    fireEvent.click(await screen.findByText('Fix in test'))
    const key = testKeyOf({ name: 'Checkout', testId: 't1', ownership: 'recorded', suiteIds: [] })
    expect(navigate).toHaveBeenCalledWith(`/overview/tests/${toRouteParam(key)}`)
  })

  it('stays collapsed with a neutral line while the step is looked up, then says it is not found', async () => {
    let answer: (map: unknown) => void = () => {}
    window.api.mapFailedStep = vi.fn().mockReturnValue(new Promise((r) => (answer = r)))
    renderCard()
    expect(screen.getByTestId('technical-details')).not.toHaveAttribute('open')
    expect(screen.getByTestId('failed-step-line')).toHaveTextContent('Finding the failed step…')
    expect(screen.queryByText("Couldn't tell which step failed")).not.toBeInTheDocument()

    answer({ none: 'noMap' })
    await waitFor(() =>
      expect(screen.getByTestId('failed-step-line')).toHaveTextContent(
        "Couldn't tell which step failed"
      )
    )
    expect(screen.getByTestId('technical-details')).not.toHaveAttribute('open')
  })

  it('says which step failed for a quarantined result too', async () => {
    const quarantined = { ...result, status: 'quarantined' }
    render(
      <TestResultCard
        name="Checkout"
        status="quarantined"
        failure={quarantined.failure}
        projectPath="/p"
        result={quarantined}
        recordedTest={test1}
      />
    )
    fireEvent.click(screen.getByText('Checkout'))
    const line = await screen.findByTestId('failed-step-line')
    await waitFor(() => expect(line).toHaveTextContent('Failed at step 4: Click "Save".'))
    expect(window.api.mapFailedStep).toHaveBeenCalledTimes(1)
  })

  it('says the element could not be found when it has no label', async () => {
    const unlabelled = {
      ...test1,
      steps: [{ id: 'd', kind: 'click', element: { label: '', selectors: [] } }]
    } as unknown as Test
    render(
      <TestResultCard
        name="Checkout"
        status="failed"
        failure={result.failure}
        projectPath="/p"
        result={result}
        recordedTest={unlabelled}
      />
    )
    fireEvent.click(screen.getByText('Checkout'))
    expect(await screen.findByText(/Couldn't find this element\./)).toBeInTheDocument()
    screen.getAllByText(/#btn-x/).forEach((el) => expect(el).not.toBeVisible())
  })
})
