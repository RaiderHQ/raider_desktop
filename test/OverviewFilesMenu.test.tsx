import { render, screen, fireEvent, act, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { MemoryRouter } from 'react-router'
import toast, { Toaster } from 'react-hot-toast'
import '@foundation/Translation/Backend'
import Overview from '@pages/Overview'
import useProjectStore from '@foundation/Stores/projectStore'
import useFileClipboardStore from '@foundation/Stores/fileClipboardStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import type { FileNode } from '@foundation/Types/fileNode'

/** The Files tab's right-click menu (F3): New, Copy, Paste, Duplicate, Rename, Delete. */

// Keys stand in for copy, except the undo toast's, which reads the real i18n instance
vi.mock('react-i18next', () => ({
  initReactI18next: { type: '3rdParty', init: (): void => undefined },
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

// A stand-in tree: a file row and a folder row that prevent the default like the real ones,
// and a root row that lets the right-click reach the tree's own handler
vi.mock('@components/Library/Folder', () => ({
  default: ({
    onFileClick,
    onFileContextMenu,
    onFolderContextMenu,
    revealPath
  }: {
    revealPath?: string
    onFileClick: (path: string) => void
    onFileContextMenu: (e: React.MouseEvent, path: string, name: string) => void
    onFolderContextMenu: (e: React.MouseEvent, path: string, name: string) => void
  }): JSX.Element => (
    <div data-testid="folder" ref={() => revealPath && reveals.push(revealPath)}>
      <div data-testid="root-row">project</div>
      <div
        data-testid="spec-folder"
        onContextMenu={(e) => {
          e.preventDefault()
          onFolderContextMenu(e, '/fake/project/spec', 'spec')
        }}
      >
        spec
      </div>
      <div
        data-testid="spec-file"
        onClick={() => onFileClick('/fake/project/spec/a_spec.rb')}
        onContextMenu={(e) => {
          e.preventDefault()
          onFileContextMenu(e, '/fake/project/spec/a_spec.rb', 'a_spec.rb')
        }}
      >
        a_spec.rb
      </div>
    </div>
  )
}))

vi.mock('@components/ScaffoldPanel', () => ({ default: (): null => null }))
vi.mock('@components/ProjectDashboard', () => ({ default: (): null => null }))
vi.mock('@components/Editor', () => ({
  default: ({
    value,
    onChange
  }: {
    value: string
    onChange?: (value: string) => void
  }): JSX.Element => (
    <textarea
      data-testid="editor"
      defaultValue={value}
      onChange={(e) => onChange?.(e.target.value)}
    />
  )
}))
vi.mock('@foundation/helpers', () => ({ getFileLanguage: (): string => 'ruby' }))
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: (): (() => void) => vi.fn()
}))
vi.mock('@foundation/Stores/rubyStore', () => ({
  __esModule: true,
  default: Object.assign(
    vi.fn(() => ({ rubyCommand: '/usr/bin/ruby', setRubyCommand: vi.fn() })),
    { getState: (): { rubyCommand: string } => ({ rubyCommand: '/usr/bin/ruby' }) }
  )
}))

// Every revealPath the tree was given
const reveals: string[] = []

const tree: FileNode[] = [
  {
    name: 'spec',
    path: '/fake/project/spec',
    type: 'folder',
    isDirectory: true,
    children: [
      { name: 'a_spec.rb', path: '/fake/project/spec/a_spec.rb', type: 'file', isDirectory: false },
      { name: 'pages', path: '/fake/project/spec/pages', type: 'folder', isDirectory: true }
    ]
  },
  { name: 'Gemfile', path: '/fake/project/Gemfile', type: 'file', isDirectory: false }
]

const api = {
  openDocs: vi.fn(),
  listProjectTests: vi.fn(),
  getTests: vi.fn(),
  readDirectory: vi.fn(),
  setActiveProject: vi.fn(),
  getProjectConfig: vi.fn(),
  isQuickProject: vi.fn(),
  getRecorderSettings: vi.fn(),
  getRunDefaults: vi.fn(),
  onTestsUpdated: vi.fn(),
  readFile: vi.fn(),
  editFile: vi.fn(),
  createProjectEntry: vi.fn(),
  copyProjectEntry: vi.fn(),
  duplicateProjectEntry: vi.fn(),
  renameProjectEntry: vi.fn(),
  trashProjectEntry: vi.fn(),
  scaffoldGenerate: vi.fn()
}

beforeAll(() => {
  // react-hot-toast's Toaster asks for prefers-reduced-motion, which jsdom lacks
  window.matchMedia = (): MediaQueryList =>
    ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) as never
})

beforeEach(async () => {
  vi.clearAllMocks()
  toast.remove()
  reveals.length = 0
  api.listProjectTests.mockResolvedValue([])
  api.getTests.mockResolvedValue([])
  api.readDirectory.mockResolvedValue(tree)
  api.setActiveProject.mockResolvedValue({ success: true })
  api.getProjectConfig.mockResolvedValue({ success: true, config: {} })
  api.isQuickProject.mockResolvedValue(false)
  api.getRecorderSettings.mockResolvedValue({ implicitWait: 3, explicitWait: 15 })
  api.getRunDefaults.mockResolvedValue({ recommendedWorkers: 2, maxWorkers: 8 })
  api.onTestsUpdated.mockReturnValue(vi.fn())
  api.readFile.mockResolvedValue({ success: true, data: 'file text' })
  api.editFile.mockResolvedValue({ success: true })
  api.createProjectEntry.mockResolvedValue({ success: true, path: 'spec/new_spec.rb' })
  api.copyProjectEntry.mockResolvedValue({
    success: true,
    path: 'spec/pages/a_spec.rb',
    skipped: 0
  })
  api.duplicateProjectEntry.mockResolvedValue({ success: true, path: 'spec/a_spec_copy.rb' })
  api.renameProjectEntry.mockResolvedValue({ success: true, path: 'spec/b_spec.rb' })
  api.trashProjectEntry.mockResolvedValue({ success: true })
  api.scaffoldGenerate.mockResolvedValue({
    success: true,
    output: 'create  spec/checkout_page.rb',
    files: ['spec/checkout_page.rb']
  })
  // @ts-expect-error - a partial window.api
  window.api = api
  useTestsListStore.setState({ rows: null, tests: [] })
  useFileClipboardStore.getState().clear()
  useProjectStore.setState({ projectPath: '/fake/project', files: [] })
  await act(async () => {})
  useProjectStore.setState({
    files: tree,
    layout: {
      framework: 'rspec',
      automation: 'selenium',
      specPath: 'spec',
      featurePath: 'features',
      helperPath: 'helpers',
      waitHelper: false,
      recordable: true
    } as never
  })
})

const renderFiles = async (): Promise<void> => {
  await act(async () => {
    render(
      <MemoryRouter>
        <Toaster />
        <Overview />
      </MemoryRouter>
    )
  })
  await act(async () => {
    fireEvent.click(screen.getByText('overview.tabs.files'))
  })
}

const rightClick = (el: HTMLElement): void => {
  fireEvent.contextMenu(el, { clientX: 10, clientY: 20 })
}

const menuLabels = (): string[] =>
  screen.getAllByRole('menuitem').map((b) => b.textContent as string)

const click = async (name: string): Promise<void> => {
  await act(async () => {
    const item = name.startsWith('files.menu.') ? 'menuitem' : 'button'
    fireEvent.click(screen.getByRole(item, { name }))
  })
}

const typeName = async (value: string): Promise<void> => {
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByRole('textbox'), { target: { value } })
  await act(async () => {
    fireEvent.click(
      within(dialog).getByRole('button', { name: /files\.(name\.create|rename\.confirm)/ })
    )
  })
}

const openEditorOn = async (testId: string): Promise<void> => {
  await act(async () => {
    fireEvent.click(screen.getByTestId(testId))
  })
  expect(screen.getByTestId('editor')).toBeInTheDocument()
}

describe('Files tab context menu', () => {
  it('offers the full menu on a file, and on a folder with the scaffolding group', async () => {
    await renderFiles()
    const full = [
      'files.menu.newFile',
      'files.menu.newFolder',
      'files.menu.copy',
      'files.menu.paste',
      'files.menu.duplicate',
      'files.menu.rename',
      'files.menu.copyPath',
      'files.menu.delete'
    ]
    rightClick(screen.getByTestId('spec-file'))
    expect(menuLabels()).toEqual(full)
    fireEvent.keyDown(document, { key: 'Escape' })
    rightClick(screen.getByTestId('spec-folder'))
    expect(menuLabels()).toEqual([
      'files.menu.newFile',
      'files.menu.newFolder',
      'files.menu.newPage',
      'files.menu.newSpec',
      'files.menu.newComponent',
      'files.menu.newHelper',
      ...full.slice(2)
    ])
    // The group is set apart from New file / New folder and from the rest
    expect(within(screen.getByRole('menu')).getAllByRole('separator')).toHaveLength(2)
  })

  it('offers New and Paste only on the root row and on empty tree space', async () => {
    await renderFiles()
    rightClick(screen.getByTestId('root-row'))
    expect(menuLabels()).toEqual(['files.menu.newFile', 'files.menu.newFolder', 'files.menu.paste'])
    fireEvent.keyDown(document, { key: 'Escape' })
    rightClick(screen.getByTestId('file-tree'))
    expect(menuLabels()).toEqual(['files.menu.newFile', 'files.menu.newFolder', 'files.menu.paste'])
  })

  it('disables Paste until something is copied', async () => {
    await renderFiles()
    rightClick(screen.getByTestId('spec-file'))
    expect(screen.getByRole('menuitem', { name: 'files.menu.paste' })).toBeDisabled()
  })

  it('disables Paste for an entry copied in another project', async () => {
    useFileClipboardStore
      .getState()
      .copy({ projectPath: '/other', rel: 'x.rb', name: 'x.rb', kind: 'file' })
    await renderFiles()
    rightClick(screen.getByTestId('root-row'))
    expect(screen.getByRole('menuitem', { name: 'files.menu.paste' })).toBeDisabled()
  })

  it("creates a file in the file's folder, reloads the tree and opens it", async () => {
    await renderFiles()
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.newFile')
    expect(screen.getByRole('dialog', { name: 'files.newFile.title' })).toBeInTheDocument()
    api.readDirectory.mockClear()
    await typeName('new_spec.rb')
    expect(api.createProjectEntry).toHaveBeenCalledWith(
      '/fake/project',
      'spec',
      'new_spec.rb',
      'file'
    )
    expect(api.readDirectory).toHaveBeenCalledWith('/fake/project')
    expect(api.readFile).toHaveBeenCalledWith('/fake/project/spec/new_spec.rb')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('creates a folder inside a right-clicked folder and at the root', async () => {
    api.createProjectEntry.mockResolvedValue({ success: true, path: 'spec/support' })
    await renderFiles()
    rightClick(screen.getByTestId('spec-folder'))
    await click('files.menu.newFolder')
    await typeName('support')
    expect(api.createProjectEntry).toHaveBeenCalledWith(
      '/fake/project',
      'spec',
      'support',
      'folder'
    )
    expect(api.readFile).not.toHaveBeenCalled()

    rightClick(screen.getByTestId('file-tree'))
    await click('files.menu.newFolder')
    await typeName('lib')
    expect(api.createProjectEntry).toHaveBeenLastCalledWith('/fake/project', '', 'lib', 'folder')
  })

  it('refuses a taken or invalid name in place, keeping the dialog open', async () => {
    await renderFiles()
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.newFolder')
    await typeName('pages')
    expect(screen.getByRole('alert')).toHaveTextContent('files.name.taken')
    await typeName('../x')
    expect(screen.getByRole('alert')).toHaveTextContent('files.name.invalid')
    expect(api.createProjectEntry).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows the error main gives back when the name turns out to be taken', async () => {
    api.createProjectEntry.mockResolvedValue({ success: false, error: 'x', code: 'exists' })
    await renderFiles()
    rightClick(screen.getByTestId('root-row'))
    await click('files.menu.newFile')
    await typeName('raced.rb')
    expect(screen.getByRole('alert')).toHaveTextContent('files.name.taken')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('offers Undo after New, which sends the new file to the Trash and closes it', async () => {
    await renderFiles()
    rightClick(screen.getByTestId('root-row'))
    await click('files.menu.newFile')
    await typeName('new_spec.rb')
    expect(screen.getByTestId('editor')).toBeInTheDocument()
    await click('Undo')
    expect(api.trashProjectEntry).toHaveBeenCalledWith('/fake/project', 'spec/new_spec.rb')
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
  })

  it('copies a file and pastes it into a folder, or into the root', async () => {
    await renderFiles()
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.copy')
    expect(useFileClipboardStore.getState().copied).toMatchObject({
      rel: 'spec/a_spec.rb',
      kind: 'file'
    })
    rightClick(screen.getByTestId('spec-folder'))
    await click('files.menu.paste')
    expect(api.copyProjectEntry).toHaveBeenCalledWith('/fake/project', 'spec/a_spec.rb', 'spec')
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.paste')
    expect(api.copyProjectEntry).toHaveBeenLastCalledWith('/fake/project', 'spec/a_spec.rb', 'spec')
    rightClick(screen.getByTestId('file-tree'))
    await click('files.menu.paste')
    expect(api.copyProjectEntry).toHaveBeenLastCalledWith('/fake/project', 'spec/a_spec.rb', '')
    // Undo of the last paste trashes what it made
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Undo' }).at(-1)!)
    })
    expect(api.trashProjectEntry).toHaveBeenCalledWith('/fake/project', 'spec/pages/a_spec.rb')
  })

  it('says so when a folder is pasted into itself', async () => {
    api.copyProjectEntry.mockResolvedValue({ success: false, error: 'x', code: 'intoItself' })
    const error = vi.spyOn(toast, 'error')
    await renderFiles()
    rightClick(screen.getByTestId('spec-folder'))
    await click('files.menu.copy')
    rightClick(screen.getByTestId('spec-folder'))
    await click('files.menu.paste')
    expect(api.copyProjectEntry).toHaveBeenCalledWith('/fake/project', 'spec', 'spec')
    expect(error).toHaveBeenCalledWith('files.toast.pasteIntoItself')
  })

  it('duplicates through the confined handler and offers Undo', async () => {
    await renderFiles()
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.duplicate')
    expect(api.duplicateProjectEntry).toHaveBeenCalledWith('/fake/project', 'spec/a_spec.rb')
    await click('Undo')
    expect(api.trashProjectEntry).toHaveBeenCalledWith('/fake/project', 'spec/a_spec_copy.rb')
  })

  it('asks before moving to the Trash, then trashes and closes the open file', async () => {
    await renderFiles()
    await openEditorOn('spec-file')
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.delete')
    expect(screen.getByRole('dialog', { name: 'files.delete.title' })).toBeInTheDocument()
    expect(api.trashProjectEntry).not.toHaveBeenCalled()
    await click('files.delete.confirm')
    expect(api.trashProjectEntry).toHaveBeenCalledWith('/fake/project', 'spec/a_spec.rb')
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
  })

  it('warns that unsaved edits go with a trashed folder, and closes the editor', async () => {
    await renderFiles()
    await openEditorOn('spec-file')
    fireEvent.change(screen.getByTestId('editor'), { target: { value: 'edited' } })
    rightClick(screen.getByTestId('spec-folder'))
    await click('files.menu.delete')
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent(
      'files.delete.unsaved'
    )
    await click('files.delete.confirm')
    expect(api.trashProjectEntry).toHaveBeenCalledWith('/fake/project', 'spec')
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
  })

  it('keeps the editor open when the Trash refuses', async () => {
    api.trashProjectEntry.mockResolvedValue({ success: false, error: 'nope' })
    await renderFiles()
    await openEditorOn('spec-file')
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.delete')
    await click('files.delete.confirm')
    expect(screen.getByTestId('editor')).toBeInTheDocument()
  })

  it('renames through the confined handler and the open file follows', async () => {
    await renderFiles()
    await openEditorOn('spec-file')
    fireEvent.change(screen.getByTestId('editor'), { target: { value: 'edited' } })
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.rename')
    expect(within(screen.getByRole('dialog')).getByRole('textbox')).toHaveValue('a_spec.rb')
    await typeName('b_spec.rb')
    expect(api.renameProjectEntry).toHaveBeenCalledWith(
      '/fake/project',
      'spec/a_spec.rb',
      'b_spec.rb'
    )
    // Saving the kept edit writes to the new path
    await click('editor.saveButton')
    expect(api.editFile).toHaveBeenCalledWith('/fake/project/spec/b_spec.rb', 'edited')
  })

  it('reloads the Tests list and reveals the new entry after a change', async () => {
    await renderFiles()
    api.listProjectTests.mockClear()
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.duplicate')
    expect(api.listProjectTests).toHaveBeenCalled()
    expect(reveals).toContain('/fake/project/spec/a_spec_copy.rb')
    // Used once: a later render does not reveal it again
    reveals.length = 0
    rightClick(screen.getByTestId('spec-file'))
    expect(reveals).toEqual([])
  })

  it('asks about unsaved edits before Undo trashes the open new file', async () => {
    await renderFiles()
    rightClick(screen.getByTestId('root-row'))
    await click('files.menu.newFile')
    await typeName('new_spec.rb')
    fireEvent.change(screen.getByTestId('editor'), { target: { value: 'typed' } })
    await click('Undo')
    expect(api.trashProjectEntry).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await click('editor.unsaved.discard')
    expect(api.trashProjectEntry).toHaveBeenCalledWith('/fake/project', 'spec/new_spec.rb')
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument()
  })

  it('says a recorded test is renamed from the Tests tab', async () => {
    api.renameProjectEntry.mockResolvedValue({ success: false, error: 'x', code: 'recorded' })
    await renderFiles()
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.rename')
    await typeName('b_spec.rb')
    expect(screen.getByRole('alert')).toHaveTextContent('files.error.recorded')
  })

  it('selects the name without its extension when renaming a file', async () => {
    await renderFiles()
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.rename')
    const input = within(screen.getByRole('dialog')).getByRole('textbox') as HTMLInputElement
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 6])
  })

  it('refuses to rename the open file while it is being saved', async () => {
    api.editFile.mockReturnValue(new Promise(() => {}))
    await renderFiles()
    await openEditorOn('spec-file')
    fireEvent.change(screen.getByTestId('editor'), { target: { value: 'edited' } })
    await click('editor.saveButton')
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.rename')
    await typeName('b_spec.rb')
    expect(screen.getByRole('alert')).toHaveTextContent('files.name.saving')
    expect(api.renameProjectEntry).not.toHaveBeenCalled()
  })

  it('moves the copied entry along when it is renamed', async () => {
    await renderFiles()
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.copy')
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.rename')
    await typeName('b_spec.rb')
    expect(useFileClipboardStore.getState().copied?.rel).toBe('spec/b_spec.rb')
  })

  it('cancels Delete with Escape', async () => {
    await renderFiles()
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.delete')
    const confirm = screen.getByRole('button', { name: 'files.delete.confirm' })
    expect(confirm).toHaveFocus()
    fireEvent.keyDown(confirm, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('holds back a save while a rename is on its way', async () => {
    let finish: (value: unknown) => void = () => {}
    api.renameProjectEntry.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await renderFiles()
    await openEditorOn('spec-file')
    fireEvent.change(screen.getByTestId('editor'), { target: { value: 'edited' } })
    rightClick(screen.getByTestId('spec-file'))
    await click('files.menu.rename')
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'b_spec.rb' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'files.rename.confirm' }))
    await act(async () => {
      fireEvent.keyDown(window, { key: 's', metaKey: true })
    })
    expect(api.editFile).not.toHaveBeenCalled()
    await act(async () => finish({ success: true, path: 'spec/b_spec.rb' }))
    await act(async () => {
      fireEvent.keyDown(window, { key: 's', metaKey: true })
    })
    expect(api.editFile).toHaveBeenCalledWith('/fake/project/spec/b_spec.rb', 'edited')
  })
})

// New page object… / New spec… / New component… / New helper… on a folder: raider g … --path
describe('Files tab scaffolding', () => {
  const startScaffold = async (item: string): Promise<void> => {
    await renderFiles()
    rightClick(screen.getByTestId('spec-folder'))
    await click(item)
  }

  it.each([
    ['files.menu.newPage', 'page'],
    ['files.menu.newSpec', 'spec'],
    ['files.menu.newComponent', 'component'],
    ['files.menu.newHelper', 'helper']
  ])('%s asks for a name, then generates a %s into the folder', async (item, type) => {
    await startScaffold(item)
    expect(screen.getByRole('dialog', { name: `files.scaffold.${type}.title` })).toBeInTheDocument()
    await typeName('checkout')
    expect(api.scaffoldGenerate).toHaveBeenCalledWith(
      { operation: 'generate', type, name: 'checkout', path: 'spec' },
      '/fake/project',
      '/usr/bin/ruby'
    )
  })

  it('reloads the tree and the Tests list, reveals the new file and opens it', async () => {
    await startScaffold('files.menu.newPage')
    api.readDirectory.mockClear()
    api.listProjectTests.mockClear()
    await typeName('checkout')
    expect(api.readDirectory).toHaveBeenCalledWith('/fake/project')
    expect(api.listProjectTests).toHaveBeenCalled()
    expect(reveals).toContain('/fake/project/spec/checkout_page.rb')
    expect(api.readFile).toHaveBeenCalledWith('/fake/project/spec/checkout_page.rb')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the file the name will make', async () => {
    await startScaffold('files.menu.newPage')
    fireEvent.change(within(screen.getByRole('dialog')).getByRole('textbox'), {
      target: { value: 'CheckoutPage' }
    })
    expect(screen.getByRole('dialog')).toHaveTextContent('files.scaffold.preview')
  })

  it.each(['', 'check out', 'admin/users', '../x', '2fa', 'login.rb', '--force'])(
    'refuses the name %j in place',
    async (name) => {
      await startScaffold('files.menu.newPage')
      await typeName(name)
      expect(screen.getByRole('alert')).toHaveTextContent(
        name === '' ? 'files.name.empty' : 'files.scaffold.invalidName'
      )
      expect(api.scaffoldGenerate).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    }
  )

  it('refuses in place a name whose file is already in the folder', async () => {
    // spec/a_spec.rb is in the tree
    await startScaffold('files.menu.newSpec')
    await typeName('a')
    expect(screen.getByRole('alert')).toHaveTextContent('files.name.taken')
    expect(api.scaffoldGenerate).not.toHaveBeenCalled()
  })

  it('keeps the dialog open when main finds the file there after all', async () => {
    api.scaffoldGenerate.mockResolvedValue({
      success: false,
      output: '',
      error: 'spec/checkout_page.rb already exists',
      code: 'exists'
    })
    await startScaffold('files.menu.newPage')
    await typeName('checkout')
    expect(screen.getByRole('alert')).toHaveTextContent('files.name.taken')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(api.readFile).not.toHaveBeenCalled()
  })

  it('closes and says why when Ruby Raider fails', async () => {
    api.scaffoldGenerate.mockResolvedValue({ success: false, output: 'boom', error: 'boom' })
    const error = vi.spyOn(toast, 'error')
    await startScaffold('files.menu.newHelper')
    await typeName('session')
    expect(error).toHaveBeenCalledWith('files.toast.scaffoldFailed')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.readFile).not.toHaveBeenCalled()
  })

  it('closes and says why when the call itself throws', async () => {
    api.scaffoldGenerate.mockRejectedValue(new Error('ipc down'))
    const error = vi.spyOn(toast, 'error')
    await startScaffold('files.menu.newHelper')
    await typeName('session')
    expect(error).toHaveBeenCalledWith('files.toast.scaffoldFailed')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
