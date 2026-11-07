import { render, screen, act, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import MainTemplate from '@templates/Main'
import { onMenuCommand } from '@foundation/menuCommands'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useTitleStore from '@foundation/Stores/titleStore'
import useEditorStore from '@foundation/Stores/editorStore'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string, opts?: object) => string } => ({
    t: (key: string, opts?: object): string => (opts ? `${key} ${JSON.stringify(opts)}` : key)
  })
}))

vi.mock('@foundation/Stores/versionStore', () => ({
  __esModule: true,
  default: vi.fn(() => '2.0.0')
}))

const projectState = vi.hoisted(() => ({
  projectPath: '/fake/project',
  setProjectPath: vi.fn()
}))
vi.mock('@foundation/Stores/projectStore', () => {
  const useProjectStore = (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(projectState) : projectState
  useProjectStore.getState = () => projectState
  useProjectStore.subscribe = vi.fn()
  return { default: useProjectStore }
})

vi.mock('@foundation/Stores/rubyStore', () => {
  const state = {
    rubyCommand: null,
    rubyVersion: null,
    versionWarning: null,
    setRubyCommand: vi.fn(),
    setRubyVersion: vi.fn(),
    setVersionWarning: vi.fn()
  }
  const useRubyStore = (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state
  useRubyStore.getState = () => state
  return { default: useRubyStore }
})

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn() }),
  Toaster: (): JSX.Element => <div data-testid="toaster" />
}))

// Mock window.api to prevent useEffect errors
beforeAll(() => {
  ;(window as unknown as Record<string, unknown>).api = {
    isRubyInstalled: vi
      .fn()
      .mockResolvedValue({ success: true, rubyCommand: 'ruby', rubyVersion: '3.2.0' }),
    closeApp: vi.fn(),
    onTestsMigrated: vi.fn(() => vi.fn()),
    onRunEvent: vi.fn(() => vi.fn()),
    getActiveRun: vi.fn().mockResolvedValue(null),
    onSuitesTooNew: vi.fn(() => vi.fn()),
    onTraceOpened: vi.fn(() => vi.fn()),
    onSuitesRecovered: vi.fn(() => vi.fn()),
    onSuiteUpdated: vi.fn(() => vi.fn()),
    onMenuCommand: vi.fn(() => vi.fn()),
    openDocs: vi.fn().mockResolvedValue({ success: true }),
    setDocumentEdited: vi.fn(),
    selectFolder: vi.fn().mockResolvedValue('/picked/project')
  }
})

describe('MainTemplate Navigation', () => {
  it('has no Recorder navigation link', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )

    expect(screen.queryByText('Recorder')).not.toBeInTheDocument()
  })

  it('links "Ruby Raider" to the overview whenever a project is open', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <MainTemplate />
      </MemoryRouter>
    )

    expect(screen.getByText('Ruby Raider').closest('a')).toHaveAttribute('href', '/overview')
  })

  it('displays the version in the footer', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )

    expect(screen.getByText(/version/)).toBeInTheDocument()
  })
})

describe('MainTemplate suites recovered toast', () => {
  const recoveredListener = (): ((info?: { backupSaved?: boolean }) => void) => {
    const subscribe = (
      window as unknown as { api: { onSuitesRecovered: ReturnType<typeof vi.fn> } }
    ).api.onSuitesRecovered
    return subscribe.mock.calls[subscribe.mock.calls.length - 1][0]
  }

  it('says a copy was kept when the backup was saved', async () => {
    const toast = (await import('react-hot-toast')).default as unknown as {
      error: ReturnType<typeof vi.fn>
    }
    toast.error.mockClear()
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )
    recoveredListener()({ backupSaved: true })
    expect(toast.error).toHaveBeenCalledWith('suites.recovered.backupSaved', expect.anything())
  })

  it('says no copy could be kept when the backup failed', async () => {
    const toast = (await import('react-hot-toast')).default as unknown as {
      error: ReturnType<typeof vi.fn>
    }
    toast.error.mockClear()
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )
    recoveredListener()({ backupSaved: false })
    expect(toast.error).toHaveBeenCalledWith('suites.recovered.backupFailed', expect.anything())
  })
})

describe('MainTemplate project files toasts', () => {
  type Api = Record<string, ReturnType<typeof vi.fn>>
  const api = (): Api => (window as unknown as { api: Api }).api
  const listener = (name: string): ((...args: unknown[]) => void) =>
    api()[name].mock.calls.at(-1)![0]
  const toastMock = async (): Promise<
    ReturnType<typeof vi.fn> & {
      success: ReturnType<typeof vi.fn>
      error: ReturnType<typeof vi.fn>
    }
  > => (await import('react-hot-toast')).default as never

  const renderMain = (): void => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )
  }

  it('says the recorded tests are now project files', async () => {
    const toast = await toastMock()
    toast.success.mockClear()
    renderMain()
    listener('onTestsMigrated')({ migrated: 2, postponed: false })
    expect(toast.success).toHaveBeenCalledWith(
      'suites.migrated.done {"count":2}',
      expect.anything()
    )
  })

  it('says a postponed move keeps the tests safe', async () => {
    const toast = await toastMock()
    toast.mockClear()
    renderMain()
    listener('onTestsMigrated')({ migrated: 0, postponed: true })
    expect(toast).toHaveBeenCalledWith('suites.migrated.postponed', expect.anything())
  })

  it('says suites from a newer Raider are left alone', async () => {
    const toast = await toastMock()
    toast.error.mockClear()
    renderMain()
    listener('onSuitesTooNew')()
    expect(toast.error).toHaveBeenCalledWith('suites.tooNew', expect.anything())
  })

  describe('menu bar commands (D11)', () => {
    const api = (): Record<string, ReturnType<typeof vi.fn>> =>
      (window as unknown as { api: Record<string, ReturnType<typeof vi.fn>> }).api
    const menuListener = (): ((command: string) => void) => {
      const subscribe = api().onMenuCommand
      return subscribe.mock.calls[subscribe.mock.calls.length - 1][0]
    }
    const Where = (): JSX.Element => <div data-testid="where">{useLocation().pathname}</div>

    const renderAt = (path: string): void => {
      render(
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<MainTemplate />}>
              <Route path="*" element={<Where />} />
            </Route>
          </Routes>
        </MemoryRouter>
      )
    }

    it('New project… opens the create page', () => {
      renderAt('/overview')
      act(() => menuListener()('new-project'))
      expect(screen.getByTestId('where')).toHaveTextContent('/new')
    })

    it('Open project… picks a folder and opens it', async () => {
      renderAt('/')
      await act(async () => menuListener()('open-project'))
      expect(api().selectFolder).toHaveBeenCalled()
      expect(projectState.setProjectPath).toHaveBeenCalledWith('/picked/project')
      expect(screen.getByTestId('where')).toHaveTextContent('/overview')
    })

    it('How Ruby Raider works opens the concepts modal', () => {
      // The modal portals into #root, as in the app
      const root = document.createElement('div')
      root.id = 'root'
      document.body.appendChild(root)
      renderAt('/overview')
      act(() => menuListener()('how-it-works'))
      expect(screen.getByText('concepts.title')).toBeInTheDocument()
      root.remove()
    })

    it('New test opens the Tests tab new test form when a project is open', () => {
      renderAt('/overview')
      act(() => menuListener()('new-test'))
      expect(screen.getByTestId('where')).toHaveTextContent('/overview/tests/new')
    })

    it('New test is ignored on the start screen while a project stays loaded (U7)', () => {
      renderAt('/start-project')
      act(() => menuListener()('new-test'))
      expect(screen.getByTestId('where')).toHaveTextContent('/start-project')
    })

    it('New test is ignored when no project is open', async () => {
      const toast = (await import('react-hot-toast')).default as unknown as {
        error: ReturnType<typeof vi.fn>
      }
      toast.error.mockClear()
      projectState.projectPath = null as unknown as string
      try {
        renderAt('/')
        act(() => menuListener()('new-test'))
        expect(screen.getByTestId('where')).toHaveTextContent('/')
        expect(screen.getByTestId('where')).not.toHaveTextContent('tests/new')
        expect(toast.error).not.toHaveBeenCalled()
      } finally {
        projectState.projectPath = '/fake/project'
      }
    })

    it('passes Stop and View file on to the page, but not Docs (it opens the docs site)', () => {
      renderAt('/overview')
      const seen: string[] = []
      const off = onMenuCommand((c) => seen.push(c))
      act(() => {
        menuListener()('stop')
        menuListener()('open-file')
        menuListener()('docs')
      })
      off()
      expect(seen).toEqual(['stop', 'open-file'])
    })

    describe('Help › Recording guide', () => {
      afterEach(() => {
        useRecorderStore.setState({ recordingUrl: null, guideOpen: false })
      })

      it('opens the guide as a modal when nothing is recording, and not on the page', () => {
        useRecorderStore.setState({ recordingUrl: null })
        renderAt('/overview')
        const seen: string[] = []
        const off = onMenuCommand((c) => seen.push(c))
        act(() => menuListener()('recording-guide'))
        off()
        expect(seen).toEqual([])
        expect(screen.getByRole('dialog', { name: 'guide.title' })).toBeInTheDocument()
      })

      it('reopens the card instead while a recording layout is showing', () => {
        useRecorderStore.setState({ recordingUrl: 'https://example.com', guideOpen: false })
        renderAt('/overview')
        act(() => menuListener()('recording-guide'))
        expect(useRecorderStore.getState().guideOpen).toBe(true)
        expect(screen.queryByRole('dialog', { name: 'guide.title' })).not.toBeInTheDocument()
      })

      it('replaces the concepts modal, and How it works replaces the guide', () => {
        const root = document.createElement('div')
        root.id = 'root'
        document.body.appendChild(root)
        renderAt('/overview')
        act(() => menuListener()('how-it-works'))
        act(() => menuListener()('recording-guide'))
        expect(screen.queryByText('concepts.title')).not.toBeInTheDocument()
        expect(screen.getByRole('dialog', { name: 'guide.title' })).toBeInTheDocument()
        act(() => menuListener()('how-it-works'))
        expect(screen.queryByRole('dialog', { name: 'guide.title' })).not.toBeInTheDocument()
        expect(screen.getByText('concepts.title')).toBeInTheDocument()
        root.remove()
      })
    })

    it('passes Save, Record and Run on to the page that is open', () => {
      renderAt('/overview')
      const seen: string[] = []
      const off = onMenuCommand((c) => seen.push(c))
      act(() => {
        menuListener()('save')
        menuListener()('record')
        menuListener()('run')
      })
      off()
      expect(seen).toEqual(['save', 'record', 'run'])
    })

    it('refuses to open or create a project while a recording is going', async () => {
      useRecorderStore.setState({ isRecording: true })
      const toast = (await import('react-hot-toast')).default as unknown as {
        error: ReturnType<typeof vi.fn>
      }
      toast.error.mockClear()
      api().selectFolder.mockClear()
      renderAt('/overview')
      await act(async () => {
        menuListener()('open-project')
        menuListener()('new-project')
      })
      expect(api().selectFolder).not.toHaveBeenCalled()
      expect(screen.getByTestId('where')).toHaveTextContent('/overview')
      expect(toast.error).toHaveBeenCalledWith('quickRecord.stopFirst')
      useRecorderStore.setState({ isRecording: false })
    })

    it('opens one folder picker for two quick Open project… presses', async () => {
      api().selectFolder.mockClear()
      let pick: (folder: string | null) => void = () => {}
      api().selectFolder.mockReturnValueOnce(new Promise((r) => (pick = r)))
      renderAt('/')
      await act(async () => {
        menuListener()('open-project')
        menuListener()('open-project')
      })
      expect(api().selectFolder).toHaveBeenCalledTimes(1)
      await act(async () => pick(null))
    })

    it('the docs command opens docs.home', () => {
      renderAt('/overview')
      act(() => menuListener()('docs'))
      expect(api().openDocs).toHaveBeenCalledWith('docs.home')
    })

    it('the shortcuts command opens the sheet', () => {
      const root = document.createElement('div')
      root.id = 'root'
      document.body.appendChild(root)
      renderAt('/overview')
      act(() => menuListener()('shortcuts'))
      expect(screen.getByRole('dialog', { name: 'shortcuts.title' })).toBeInTheDocument()
      root.remove()
    })

    it('opening the sheet from the concepts modal closes the concepts modal', () => {
      const root = document.createElement('div')
      root.id = 'root'
      document.body.appendChild(root)
      renderAt('/overview')
      act(() => menuListener()('how-it-works'))
      fireEvent.click(screen.getByRole('button', { name: /concepts\.shortcuts/ }))
      expect(screen.queryByText('concepts.title')).not.toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'shortcuts.title' })).toBeInTheDocument()
      root.remove()
    })

    it('leaves the page alone while the help modal is open', () => {
      const root = document.createElement('div')
      root.id = 'root'
      document.body.appendChild(root)
      renderAt('/overview')
      act(() => menuListener()('how-it-works'))
      act(() => menuListener()('new-project'))
      expect(screen.getByTestId('where')).toHaveTextContent('/overview')
      root.remove()
    })

    describe('help overlays swap', () => {
      let root: HTMLElement
      beforeEach(() => {
        root = document.createElement('div')
        root.id = 'root'
        document.body.appendChild(root)
      })
      afterEach(() => root.remove())

      it('How it works with the sheet open replaces the sheet', () => {
        renderAt('/overview')
        act(() => menuListener()('shortcuts'))
        act(() => menuListener()('how-it-works'))
        expect(screen.getByText('concepts.title')).toBeInTheDocument()
        expect(screen.queryByRole('dialog', { name: 'shortcuts.title' })).not.toBeInTheDocument()
      })

      it('the shortcuts command with the concepts modal open replaces it', () => {
        renderAt('/overview')
        act(() => menuListener()('how-it-works'))
        act(() => menuListener()('shortcuts'))
        expect(screen.queryByText('concepts.title')).not.toBeInTheDocument()
        expect(screen.getByRole('dialog', { name: 'shortcuts.title' })).toBeInTheDocument()
      })

      it('neither opens over the Ruby install modal', async () => {
        api().isRubyInstalled.mockResolvedValueOnce({ success: false })
        renderAt('/overview')
        await screen.findByText('recorder.rubyInstallModal.title')
        act(() => menuListener()('shortcuts'))
        act(() => menuListener()('how-it-works'))
        expect(screen.queryByRole('dialog', { name: 'shortcuts.title' })).not.toBeInTheDocument()
        expect(screen.queryByText('concepts.title')).not.toBeInTheDocument()
      })
    })

    it('closing the sheet opened from the concepts modal focuses the header logo', () => {
      const root = document.createElement('div')
      root.id = 'root'
      document.body.appendChild(root)
      renderAt('/overview')
      fireEvent.click(screen.getByRole('button', { name: 'header.howItWorks' }))
      fireEvent.click(screen.getByRole('button', { name: /concepts\.shortcuts/ }))
      fireEvent.keyDown(screen.getByRole('dialog', { name: 'shortcuts.title' }), { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'shortcuts.title' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'header.howItWorks' })).toHaveFocus()
      root.remove()
    })

    it('a menu swap back to the concepts modal does not send focus to the logo when the sheet goes', () => {
      const root = document.createElement('div')
      root.id = 'root'
      document.body.appendChild(root)
      renderAt('/overview')
      fireEvent.click(screen.getByRole('button', { name: 'header.howItWorks' }))
      fireEvent.click(screen.getByRole('button', { name: /concepts\.shortcuts/ }))
      act(() => menuListener()('how-it-works'))
      expect(screen.getByText('concepts.title')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'header.howItWorks' })).not.toHaveFocus()
      root.remove()
    })

    describe('with unsaved edits', () => {
      afterEach(() => useEditorStore.setState({ pageDirty: false, inlineDirty: false }))

      it('the file editor page keeps New test, New project and Open project out', async () => {
        useEditorStore.setState({ pageDirty: true })
        api().selectFolder.mockClear()
        renderAt('/file-editor')
        await act(async () => {
          menuListener()('new-test')
          menuListener()('new-project')
          menuListener()('open-project')
        })
        expect(screen.getByTestId('where')).toHaveTextContent('/file-editor')
        expect(api().selectFolder).not.toHaveBeenCalled()
      })

      it('the Files tab edit keeps the project switches out but leaves New test to the Overview', async () => {
        useEditorStore.setState({ inlineDirty: true })
        api().selectFolder.mockClear()
        renderAt('/overview')
        await act(async () => {
          menuListener()('new-project')
          menuListener()('open-project')
        })
        expect(screen.getByTestId('where')).toHaveTextContent('/overview')
        expect(api().selectFolder).not.toHaveBeenCalled()
        act(() => menuListener()('new-test'))
        expect(screen.getByTestId('where')).toHaveTextContent('/overview/tests/new')
      })
    })

    it('ignores anything that is not a known command', () => {
      renderAt('/overview')
      const seen: string[] = []
      const off = onMenuCommand((c) => seen.push(c))
      act(() => menuListener()('format-disk'))
      off()
      expect(seen).toEqual([])
      expect(screen.getByTestId('where')).toHaveTextContent('/overview')
    })
  })
})

describe('MainTemplate window title', () => {
  afterEach(() => act(() => useTitleStore.getState().setDocument(null)))

  const api = (): { setDocumentEdited: ReturnType<typeof vi.fn> } =>
    (window as unknown as { api: { setDocumentEdited: ReturnType<typeof vi.fn> } }).api

  it('sets the window title from the project and the document', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )
    act(() => useTitleStore.getState().setDocument({ name: 'login_spec.rb', edited: true }))
    const dot = navigator.platform.toLowerCase().startsWith('mac') ? '' : '• '
    expect(document.title).toBe(`${dot}login_spec.rb — project — Ruby Raider`)
    expect(api().setDocumentEdited).toHaveBeenLastCalledWith(true, 'login_spec.rb')
  })

  it('clears the edited flag when the document is cleared', () => {
    render(
      <MemoryRouter initialEntries={['/overview']}>
        <MainTemplate />
      </MemoryRouter>
    )
    act(() => useTitleStore.getState().setDocument({ name: 'login_spec.rb', edited: true }))
    act(() => useTitleStore.getState().setDocument(null))
    expect(document.title).toBe('project — Ruby Raider')
    expect(api().setDocumentEdited).toHaveBeenLastCalledWith(false, '')
  })
})
