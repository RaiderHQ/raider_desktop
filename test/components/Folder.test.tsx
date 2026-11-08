import { render, screen, fireEvent } from '@testing-library/react'
import Folder from '@components/Library/Folder'
import '@testing-library/jest-dom'
import type { FileNode } from '@foundation/Types/fileNode'

const files: FileNode[] = [
  { name: 'login_spec.rb', path: '/project/login_spec.rb', type: 'file', isDirectory: false },
  {
    name: 'helpers',
    path: '/project/helpers',
    type: 'folder',
    isDirectory: true,
    children: [
      { name: 'utils.rb', path: '/project/helpers/utils.rb', type: 'file', isDirectory: false }
    ]
  }
]

describe('Folder', () => {
  it('renders the folder name', () => {
    render(<Folder name="my_project" files={[]} onFileClick={vi.fn()} />)
    expect(screen.getByText('my_project')).toBeInTheDocument()
  })

  it('root folder is always open and shows files', () => {
    render(<Folder name="root" files={files} onFileClick={vi.fn()} isRoot />)
    expect(screen.getByText('login_spec.rb')).toBeInTheDocument()
  })

  it('non-root folder is closed by default', () => {
    render(<Folder name="spec" files={files} onFileClick={vi.fn()} />)
    expect(screen.queryByText('login_spec.rb')).not.toBeInTheDocument()
  })

  it('non-root folder opens when toggle button is clicked', () => {
    render(<Folder name="spec" files={files} onFileClick={vi.fn()} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('login_spec.rb')).toBeInTheDocument()
  })

  it('root folder shows the run tests button', () => {
    const onRunTests = vi.fn()
    render(<Folder name="root" files={[]} onFileClick={vi.fn()} isRoot onRunTests={onRunTests} />)
    // The run button is the FaPlay icon button — there is only one button
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(onRunTests).toHaveBeenCalledTimes(1)
  })

  it('calls onFileClick when a file inside is clicked', () => {
    const onFileClick = vi.fn()
    render(<Folder name="root" files={files} onFileClick={onFileClick} isRoot />)
    fireEvent.click(screen.getByText('login_spec.rb'))
    expect(onFileClick).toHaveBeenCalledWith('/project/login_spec.rb')
  })

  it('renders nested folders', () => {
    render(<Folder name="root" files={files} onFileClick={vi.fn()} isRoot />)
    expect(screen.getByText('helpers')).toBeInTheDocument()
  })

  it('right-clicking a nested folder reports its path and name', () => {
    const onFolderContextMenu = vi.fn()
    render(
      <Folder
        name="root"
        files={files}
        onFileClick={vi.fn()}
        isRoot
        onFolderContextMenu={onFolderContextMenu}
      />
    )
    fireEvent.contextMenu(screen.getByText('helpers'))
    expect(onFolderContextMenu).toHaveBeenCalledWith(
      expect.anything(),
      '/project/helpers',
      'helpers'
    )
  })

  it('leaves a right-click on the root row to the tree around it', () => {
    const onFolderContextMenu = vi.fn()
    const onTree = vi.fn()
    render(
      <div onContextMenu={(e) => onTree(e.defaultPrevented)}>
        <Folder
          name="root"
          path="/project"
          files={files}
          onFileClick={vi.fn()}
          isRoot
          onFolderContextMenu={onFolderContextMenu}
        />
      </div>
    )
    fireEvent.contextMenu(screen.getByText('root'))
    expect(onFolderContextMenu).not.toHaveBeenCalled()
    expect(onTree).toHaveBeenCalledWith(false)
    // A row's right-click is handled there: the tree sees it already prevented
    fireEvent.contextMenu(screen.getByText('helpers'))
    expect(onTree).toHaveBeenLastCalledWith(true)
  })

  it('keeps a folder open when a new entry lands before it in the tree', () => {
    const tree = (extra: FileNode[]): FileNode[] => [
      ...extra,
      { name: 'b', path: '/project/b', type: 'folder', isDirectory: true, children: files }
    ]
    const { rerender } = render(
      <Folder name="root" files={tree([])} onFileClick={vi.fn()} isRoot />
    )
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.getByText('login_spec.rb')).toBeInTheDocument()
    const added: FileNode = {
      name: 'a',
      path: '/project/a',
      type: 'folder',
      isDirectory: true,
      children: []
    }
    rerender(<Folder name="root" files={tree([added])} onFileClick={vi.fn()} isRoot />)
    // b is still open, a (new, now first) is closed
    expect(screen.getByText('login_spec.rb')).toBeInTheDocument()
    expect(screen.queryByText(/^(Empty folder|files.emptyFolder)$/)).not.toBeInTheDocument()
  })

  it('opens the folders holding a revealed path, not the revealed folder itself', () => {
    const tree: FileNode[] = [
      {
        name: 'spec',
        path: '/project/spec',
        type: 'folder',
        isDirectory: true,
        children: [
          { name: 'new.rb', path: '/project/spec/new.rb', type: 'file', isDirectory: false },
          {
            name: 'pages',
            path: '/project/spec/pages',
            type: 'folder',
            isDirectory: true,
            children: []
          }
        ]
      }
    ]
    const { rerender } = render(<Folder name="root" files={tree} onFileClick={vi.fn()} isRoot />)
    expect(screen.queryByText('new.rb')).not.toBeInTheDocument()
    rerender(
      <Folder
        name="root"
        files={tree}
        onFileClick={vi.fn()}
        isRoot
        revealPath="/project/spec/pages"
      />
    )
    expect(screen.getByText('new.rb')).toBeInTheDocument()
    expect(screen.queryByText(/^(Empty folder|files.emptyFolder)$/)).not.toBeInTheDocument()
  })
})
