import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import toast from 'react-hot-toast'
import ProjectDashboard from '@components/ProjectDashboard'
import useProjectStore from '@foundation/Stores/projectStore'

const t = (key: string): string => key
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t })
}))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn() } }))
vi.mock('@components/PieChartWidget', () => ({ default: (): JSX.Element => <div /> }))
vi.mock('@components/TestResultCard', () => ({
  default: ({ name, status }: { name: string; status: string }): JSX.Element => (
    <div data-testid="row">{`${name}|${status}`}</div>
  )
}))

describe('ProjectDashboard with raider-results', () => {
  it('renders rows from a raider-results fixture without touching allure-results', async () => {
    useProjectStore.setState({ projectPath: '/proj' })
    const run = JSON.stringify({
      results: [
        { full_name: 'Login: ok', status: 'passed', attachments: [] },
        {
          full_name: 'Login: bad',
          status: 'failed',
          failure: { message: 'boom', backtrace: [] },
          attachments: []
        }
      ]
    })
    const readDirectory = vi.fn(async (dir: string) => {
      if (dir === '/proj/raider-results')
        return [
          {
            name: 'run.json',
            type: 'file',
            isDirectory: false,
            path: '/proj/raider-results/run.json'
          }
        ]
      throw new Error('ENOENT')
    })
    window.api = {
      readDirectory,
      readFile: vi.fn(async () => ({ success: true, data: run }))
    } as unknown as typeof window.api

    render(<ProjectDashboard />)

    await waitFor(() => expect(screen.getAllByTestId('row')).toHaveLength(2))
    expect(screen.getByText('Login: ok|passed')).toBeInTheDocument()
    expect(screen.getByText('Login: bad|failed')).toBeInTheDocument()
    expect(readDirectory).not.toHaveBeenCalledWith('/proj/allure-results')
  })
})

describe('ProjectDashboard Open report button', () => {
  const setup = (exists: boolean): { openReport: ReturnType<typeof vi.fn> } => {
    useProjectStore.setState({ projectPath: '/proj' })
    const openReport = vi.fn(async () => ({ success: true }))
    window.api = {
      readDirectory: vi.fn(async () => {
        throw new Error('ENOENT')
      }),
      readFile: vi.fn(),
      reportExists: vi.fn(async () => exists),
      openReport
    } as unknown as typeof window.api
    return { openReport }
  }

  it('is disabled when there is no report', async () => {
    setup(false)
    render(<ProjectDashboard />)
    const button = await screen.findByRole('button', { name: 'dashboard.openReport' })
    await waitFor(() => expect(button).toBeDisabled())
  })

  it('opens the report for the current project', async () => {
    const { openReport } = setup(true)
    render(<ProjectDashboard />)
    const button = await screen.findByRole('button', { name: 'dashboard.openReport' })
    await waitFor(() => expect(button).toBeEnabled())
    button.click()
    await waitFor(() => expect(openReport).toHaveBeenCalledWith('/proj'))
  })

  it('never reads allure-results', async () => {
    setup(false)
    render(<ProjectDashboard />)
    await screen.findByRole('button', { name: 'dashboard.openReport' })
    await waitFor(() => expect(window.api.reportExists).toHaveBeenCalled())
    expect(window.api.readDirectory).not.toHaveBeenCalledWith('/proj/allure-results')
  })

  it('enables the button after hovering once the report appears', async () => {
    setup(false)
    const reportExists = window.api.reportExists as ReturnType<typeof vi.fn>
    render(<ProjectDashboard />)
    const button = await screen.findByRole('button', { name: 'dashboard.openReport' })
    await waitFor(() => expect(reportExists).toHaveBeenCalledTimes(1))
    expect(button).toBeDisabled()
    reportExists.mockResolvedValue(true)
    fireEvent.mouseEnter(button.parentElement as HTMLElement)
    await waitFor(() => expect(button).toBeEnabled())
  })

  it('shows an error toast when opening fails', async () => {
    const { openReport } = setup(true)
    openReport.mockResolvedValue({ success: false, error: 'boom' })
    render(<ProjectDashboard />)
    const button = await screen.findByRole('button', { name: 'dashboard.openReport' })
    await waitFor(() => expect(button).toBeEnabled())
    button.click()
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('dashboard.error.openReport: boom')
    )
  })
})
