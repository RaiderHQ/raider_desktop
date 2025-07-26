import React from 'react'
import { render, screen, act } from '@testing-library/react'
import Landing from '@pages/Landing'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { version: string }) => (options ? `${key} ${options.version}` : key),
  }),
}))

vi.mock('@foundation/Stores/loadingStore', () => ({
  __esModule: true,
  default: vi.fn(() => vi.fn()),
}))

vi.mock('@foundation/Stores/projectStore', () => ({
  __esModule: true,
  default: vi.fn(() => vi.fn()),
}))

vi.mock('@foundation/Stores/versionStore', () => ({
  __esModule: true,
  default: vi.fn(() => '1.0.0'),
}))

vi.mock('@components/ProjectSelector', () => ({
  default: ({ description, buttonValue }: { description: string; buttonValue: string }) => (
    <div>
      <p>{description}</p>
      <button>{buttonValue}</button>
    </div>
  ),
}))

describe('Landing Page', () => {
  it('renders correctly', async () => {
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
    expect(screen.getByText('version 1.0.0')).toBeInTheDocument()
  })
})
