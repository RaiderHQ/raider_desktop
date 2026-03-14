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
    children: [{ name: 'utils.rb', path: '/project/helpers/utils.rb', type: 'file', isDirectory: false }]
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
})
