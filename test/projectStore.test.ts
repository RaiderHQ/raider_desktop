import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock window.api before importing the store
vi.stubGlobal('window', {
  api: {
    readDirectory: vi.fn().mockResolvedValue([])
  }
})

const { default: useProjectStore } = await import(
  '@foundation/Stores/projectStore'
)

describe('projectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      projectPath: null,
      projectConfig: null,
      projectAutomation: null,
      projectFramework: null,
      files: [],
      selectedFiles: []
    })
    vi.clearAllMocks()
  })

  it('initializes with null project path', () => {
    const state = useProjectStore.getState()
    expect(state.projectPath).toBeNull()
    expect(state.files).toEqual([])
    expect(state.selectedFiles).toEqual([])
  })

  it('sets project path', () => {
    useProjectStore.getState().setProjectPath('/test/path')
    expect(useProjectStore.getState().projectPath).toBe('/test/path')
  })

  it('sets project automation', () => {
    useProjectStore.getState().setProjectAutomation('selenium')
    expect(useProjectStore.getState().projectAutomation).toBe('selenium')
  })

  it('sets project framework', () => {
    useProjectStore.getState().setProjectFramework('rspec')
    expect(useProjectStore.getState().projectFramework).toBe('rspec')
  })

  it('clears project automation with null', () => {
    useProjectStore.getState().setProjectAutomation('selenium')
    useProjectStore.getState().setProjectAutomation(null)
    expect(useProjectStore.getState().projectAutomation).toBeNull()
  })

  describe('toggleFile', () => {
    it('selects an unselected file', () => {
      useProjectStore.getState().toggleFile('/test/file.rb')
      expect(useProjectStore.getState().selectedFiles).toContain('/test/file.rb')
    })

    it('deselects a selected file', () => {
      useProjectStore.setState({ selectedFiles: ['/test/file.rb'] })
      useProjectStore.getState().toggleFile('/test/file.rb')
      expect(useProjectStore.getState().selectedFiles).not.toContain('/test/file.rb')
    })

    it('preserves other selected files when toggling', () => {
      useProjectStore.setState({ selectedFiles: ['/test/a.rb', '/test/b.rb'] })
      useProjectStore.getState().toggleFile('/test/a.rb')
      expect(useProjectStore.getState().selectedFiles).toEqual(['/test/b.rb'])
    })
  })

  describe('toggleAll', () => {
    it('selects all file paths when true', () => {
      useProjectStore.setState({
        files: [
          { name: 'a.rb', isDirectory: false, type: 'file', path: '/test/a.rb' },
          { name: 'b.rb', isDirectory: false, type: 'file', path: '/test/b.rb' }
        ]
      })
      useProjectStore.getState().toggleAll(true)
      expect(useProjectStore.getState().selectedFiles).toEqual(['/test/a.rb', '/test/b.rb'])
    })

    it('clears all selections when false', () => {
      useProjectStore.setState({ selectedFiles: ['/test/a.rb'] })
      useProjectStore.getState().toggleAll(false)
      expect(useProjectStore.getState().selectedFiles).toEqual([])
    })

    it('recursively selects files in subdirectories', () => {
      useProjectStore.setState({
        files: [
          {
            name: 'dir',
            isDirectory: true,
            type: 'folder',
            path: '/test/dir',
            children: [
              { name: 'c.rb', isDirectory: false, type: 'file', path: '/test/dir/c.rb' }
            ]
          }
        ]
      })
      useProjectStore.getState().toggleAll(true)
      expect(useProjectStore.getState().selectedFiles).toEqual(['/test/dir/c.rb'])
    })
  })
})
