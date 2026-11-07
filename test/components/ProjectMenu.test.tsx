import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import ProjectMenu from '@components/ProjectMenu'
import useProjectStore from '@foundation/Stores/projectStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useEditorStore from '@foundation/Stores/editorStore'
import en from '../../src/renderer/src/assets/translations/en.json'

const translate = (key: string): string => {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  return typeof value === 'string' ? value : key
}
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: typeof translate } => ({ t: translate })
}))

const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() })
)
vi.mock('react-hot-toast', () => ({
  default: mockToast,
  toast: mockToast,
  Toaster: (): null => null
}))

const Where = (): React.ReactElement => <div data-testid="where">{useLocation().pathname}</div>

const renderMenu = (): void => {
  render(
    <MemoryRouter initialEntries={['/overview']}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              <ProjectMenu />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  )
}

const open = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /shop/ }))
}

describe('ProjectMenu', () => {
  beforeEach(() => {
    // The project store tells main about the active project when it changes
    Object.assign(window, {
      api: { setActiveProject: vi.fn().mockResolvedValue({ success: true }) }
    })
    mockToast.error.mockClear()
    useProjectStore.setState({ projectPath: '/Users/me/work/shop' })
    useRecorderStore.setState({
      recordingTarget: null,
      isRecording: false,
      isReplayingToBreakpoint: false
    } as never)
    useEditorStore.setState({ pageDirty: false, inlineDirty: false })
  })

  it('shows the project folder name as a menu button', () => {
    renderMenu()
    const button = screen.getByRole('button', { name: /shop/ })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('offers Switch project… and New project…', () => {
    renderMenu()
    open()
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Switch project…',
      'New project…'
    ])
  })

  it('Switch project… goes to the start screen', () => {
    renderMenu()
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch project…' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/start-project')
  })

  it('New project… goes to the new project page', () => {
    renderMenu()
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New project…' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/new')
  })

  it('stays put and says why while a recording is running', () => {
    useRecorderStore.setState({ isRecording: true } as never)
    renderMenu()
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Switch project…' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/overview')
    expect(mockToast.error).toHaveBeenCalledWith(en.quickRecord.stopFirst)
  })

  it('stays put and says why while an editor has unsaved changes', () => {
    useEditorStore.setState({ inlineDirty: true })
    renderMenu()
    open()
    fireEvent.click(screen.getByRole('menuitem', { name: 'New project…' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/overview')
    expect(mockToast.error).toHaveBeenCalledWith(en.overview.projectMenu.unsaved)
  })

  it('falls back to a plain label for a root folder, and names the path in its title', () => {
    useProjectStore.setState({ projectPath: '/' })
    renderMenu()
    const button = screen.getByTestId('project-menu')
    expect(button).toHaveTextContent('Project')
    expect(button).toHaveAttribute('title', '/')
  })

  it('puts focus back on the trigger after Escape', () => {
    renderMenu()
    open()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.getByTestId('project-menu')).toHaveFocus()
  })

  it('closes on Escape', () => {
    renderMenu()
    open()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
