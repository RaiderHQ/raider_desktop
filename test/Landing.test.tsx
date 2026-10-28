import { render, screen, act, fireEvent } from '@testing-library/react'
import Landing from '@pages/Landing'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, options?: { version: string }) => string } => ({
    t: (key: string, options?: { version: string }): string =>
      options ? `${key} ${options.version}` : key
  })
}))

vi.mock('@foundation/Stores/loadingStore', () => ({
  __esModule: true,
  default: vi.fn(() => vi.fn())
}))

vi.mock('@foundation/Stores/projectStore', () => ({
  __esModule: true,
  default: vi.fn(() => vi.fn())
}))

vi.mock('@components/ProjectSelector', () => ({
  default: ({
    description,
    buttonValue,
    url,
    onClick
  }: {
    description: string
    buttonValue: string
    url?: string
    onClick?: () => void
  }): JSX.Element => (
    <div>
      <p>{description}</p>
      {url && <a href={url}>{url}</a>}
      <button onClick={onClick}>{buttonValue}</button>
    </div>
  )
}))

vi.mock('@components/QuickRecordDialog', () => ({
  default: (): JSX.Element => <div>quick-record-dialog</div>
}))

describe('Landing Page', (): void => {
  it('renders correctly', async (): Promise<void> => {
    await act(async () => {
      render(
        <MemoryRouter>
          <Landing />
        </MemoryRouter>
      )
    })

    expect(screen.getByText('landing.title')).toBeInTheDocument()
    expect(screen.getByText('landing.subtitle')).toBeInTheDocument()
    expect(screen.getByText('button.create.description')).toBeInTheDocument()
    expect(screen.getByText('button.open.description')).toBeInTheDocument()
  })

  it('has a Quick record card that opens the dialog and no recorder link', async (): Promise<void> => {
    await act(async () => {
      render(
        <MemoryRouter>
          <Landing />
        </MemoryRouter>
      )
    })
    expect(screen.queryByText('/recorder')).not.toBeInTheDocument()
    expect(screen.queryByText('quick-record-dialog')).not.toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByText('button.recorder.text'))
    })
    expect(screen.getByText('quick-record-dialog')).toBeInTheDocument()
  })
})
