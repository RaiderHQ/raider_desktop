import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import CreateProject from '@pages/New'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

// Mocking necessary modules and hooks
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@foundation/Stores/loadingStore', () => ({
  __esModule: true,
  default: (selector: (state: any) => any) => {
    const state = {
      loading: false,
      setLoading: vi.fn(),
    }
    return selector(state)
  },
}))

vi.mock('@foundation/Stores/projectStore', () => ({
  __esModule: true,
  default: (selector: (state: any) => any) => {
    const state = {
      setProjectPath: vi.fn(),
    }
    return selector(state)
  },
}))

describe('CreateProject Page', () => {
  it('renders correctly', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <CreateProject />
        </MemoryRouter>
      )
    })

    expect(screen.getByText('newProject.title')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('newProject.input.placeholder')).toBeInTheDocument()
    expect(screen.getByText('newProject.question.automation')).toBeInTheDocument()
    expect(screen.getByText('newProject.question.test')).toBeInTheDocument()
    expect(screen.getByText('button.back.text')).toBeInTheDocument()
    expect(screen.getByText('button.create.text')).toBeInTheDocument()
  })

  it('shows mobile platform select when Appium is selected', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <CreateProject />
        </MemoryRouter>
      )
    })

    const automationSelect = screen.getAllByRole('combobox')[0]
    await act(async () => {
      fireEvent.change(automationSelect, { target: { value: 'Appium' } })
    })

    expect(screen.getByText('newProject.question.mobile')).toBeInTheDocument()
  })
})
