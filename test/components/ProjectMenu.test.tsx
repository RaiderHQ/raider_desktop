import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'
import ProjectMenu from '@components/ProjectMenu'
import useProjectStore from '@foundation/Stores/projectStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useEditorStore from '@foundation/Stores/editorStore'
import type { RecentProjectEntry } from '@shared/types/recentProject'
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

const recent = (path: string, extra: Partial<RecentProjectEntry> = {}): RecentProjectEntry => ({
  path,
  name: path.split('/').pop() ?? path,
  lastOpened: 1,
  exists: true,
  isRaider: true,
  ...extra
})

// A recent entry reads as "name path": its two lines joined with a space
const menuItems = (): string[] =>
  screen.getAllByRole('menuitem').map((m) =>
    m.children.length > 0
      ? Array.from(m.children)
          .map((c) => c.textContent)
          .join(' ')
      : (m.textContent ?? '')
  )

describe('ProjectMenu', () => {
  beforeEach(() => {
    // The project store tells main about the active project when it changes
    Object.assign(window, {
      api: {
        setActiveProject: vi.fn().mockResolvedValue({ success: true }),
        listRecentProjects: vi.fn().mockResolvedValue([])
      }
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

  it('falls back to a plain label for a root folder, and names the path in its tooltip', () => {
    useProjectStore.setState({ projectPath: '/' })
    renderMenu()
    const button = screen.getByTestId('project-menu')
    expect(button).toHaveTextContent('Project')
    expect(button).not.toHaveAttribute('title')
    fireEvent.keyDown(window, { key: 'Tab' })
    fireEvent.focus(button)
    const tip = screen.getByRole('tooltip')
    expect(tip).toHaveTextContent(en.tooltips.overview.projectMenu)
    expect(tip).toHaveTextContent('/')
  })

  it('sits on the tabs: the same type size and weight as a tab label, with a chevron icon', () => {
    renderMenu()
    const button = screen.getByTestId('project-menu')
    expect(button).toHaveClass('text-sm', 'font-semibold', 'py-2')
    expect(button).not.toHaveClass('text-xs', 'h-7')
    expect(button.querySelector('svg')).not.toBeNull()
    expect(button).not.toHaveTextContent('▾')
  })

  describe('recent projects (V3)', () => {
    const list = (entries: RecentProjectEntry[]): void => {
      ;(window.api.listRecentProjects as ReturnType<typeof vi.fn>).mockResolvedValue(entries)
    }

    it('lists the last three other projects above Switch project…, with name and path', async () => {
      list([
        recent('/Users/me/work/shop'),
        recent('/Users/me/work/bank'),
        recent('/Users/me/work/blog'),
        recent('/Users/me/work/wiki'),
        recent('/Users/me/work/zoo')
      ])
      renderMenu()
      open()
      await screen.findByRole('menuitem', { name: /bank/ })
      expect(window.api.listRecentProjects).toHaveBeenCalledTimes(1)
      expect(menuItems()).toEqual([
        'bank /Users/me/work/bank',
        'blog /Users/me/work/blog',
        'wiki /Users/me/work/wiki',
        'Switch project…',
        'New project…'
      ])
    })

    it('skips folders that are gone or not Raider projects', async () => {
      list([
        recent('/Users/me/work/gone', { exists: false }),
        recent('/Users/me/work/plain', { isRaider: false }),
        recent('/Users/me/work/bank')
      ])
      renderMenu()
      open()
      await screen.findByRole('menuitem', { name: /bank/ })
      expect(menuItems()).toEqual(['bank /Users/me/work/bank', 'Switch project…', 'New project…'])
    })

    it('opens a recent project in place, with no folder dialog', async () => {
      list([recent('/Users/me/work/bank')])
      renderMenu()
      open()
      fireEvent.click(await screen.findByRole('menuitem', { name: /bank/ }))
      expect(useProjectStore.getState().projectPath).toBe('/Users/me/work/bank')
      expect(screen.getByTestId('where')).toHaveTextContent('/overview')
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('keeps the guards: a running recording stays, and says why', async () => {
      list([recent('/Users/me/work/bank')])
      useRecorderStore.setState({ isRecording: true } as never)
      renderMenu()
      open()
      fireEvent.click(await screen.findByRole('menuitem', { name: /bank/ }))
      expect(useProjectStore.getState().projectPath).toBe('/Users/me/work/shop')
      expect(mockToast.error).toHaveBeenCalledWith(en.quickRecord.stopFirst)
    })

    it('shows only the two commands when the list fails or is empty', async () => {
      ;(window.api.listRecentProjects as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('x'))
      renderMenu()
      open()
      await Promise.resolve()
      expect(menuItems()).toEqual(['Switch project…', 'New project…'])
    })
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
