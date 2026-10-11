import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import ProjectDashboard from '@components/ProjectDashboard'
import useProjectStore from '@foundation/Stores/projectStore'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
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
