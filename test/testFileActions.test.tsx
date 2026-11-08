import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import '@foundation/Translation/Backend'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type React from 'react'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useTestClipboardStore } from '@foundation/Stores/testClipboardStore'
import {
  copyTest,
  duplicateTest,
  onTestTrashed,
  pasteTest,
  trashTestRow,
  uniqueCopyName
} from '@foundation/testFileActions'
import en from '@assets/translations/en.json'
import type { TestRow } from '@foundation/testKey'

const mockToast = vi.hoisted(() =>
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() })
)
vi.mock('react-hot-toast', () => ({ default: mockToast, toast: mockToast }))

const recorded: TestRow = {
  name: 'Login',
  file: 'spec/login_spec.rb',
  testId: 't1',
  ownership: 'recorded',
  tags: []
}
const code: TestRow = { name: 'API', file: 'spec/api/api_spec.rb', ownership: 'code', tags: [] }
const savedLogin = {
  id: 't1',
  name: 'Login',
  url: 'https://x.test',
  steps: [{ id: 's1', kind: 'navigate', url: 'https://x.test' }],
  file: 'spec/login_spec.rb',
  ownership: 'recorded',
  tags: ['smoke']
}

const api = {
  getTests: vi.fn(),
  listProjectTests: vi.fn(),
  saveRecording: vi.fn(),
  setTestTags: vi.fn(),
  readTestFile: vi.fn(),
  pasteTestFile: vi.fn(),
  trashTest: vi.fn(),
  setActiveProject: vi.fn().mockResolvedValue({ success: true }),
  readDirectory: vi.fn().mockResolvedValue([])
}

/** Renders the last toast(fn) */
const renderUndoToast = (): void => {
  const [content] = mockToast.mock.calls.at(-1)!
  render(<>{(content as (t: { id: string }) => React.ReactNode)({ id: 'x' })}</>)
}
/** Renders the last toast(fn) and clicks its Undo */
const clickUndo = async (): Promise<void> => {
  renderUndoToast()
  await act(async () => {
    fireEvent.click(screen.getByRole('button'))
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // @ts-expect-error - Mocking window.api
  window.api = api
  api.getTests.mockResolvedValue([savedLogin])
  api.listProjectTests.mockResolvedValue([])
  api.saveRecording.mockImplementation(async (_p, test) => ({
    success: true,
    test: { ...test, file: 'spec/login_copy_spec.rb' }
  }))
  api.setTestTags.mockResolvedValue({ success: true })
  api.readTestFile.mockResolvedValue({ success: true, text: 'describe' })
  api.pasteTestFile.mockResolvedValue({ success: true, file: 'spec/api/api_copy_spec.rb' })
  api.trashTest.mockResolvedValue({ success: true })
  useProjectStore.setState({ projectPath: '/p' })
  useTestsListStore.setState({ rows: [recorded, code] })
  useTestClipboardStore.setState({ item: null })
})

describe('uniqueCopyName', () => {
  it('adds " copy", then " copy 2", " copy 3"…', () => {
    expect(uniqueCopyName('Login', ['Login'])).toBe('Login copy')
    expect(uniqueCopyName('Login', ['Login', 'Login copy'])).toBe('Login copy 2')
    expect(uniqueCopyName('Login', ['Login copy', 'Login copy 2'])).toBe('Login copy 3')
  })
})

describe('copyTest', () => {
  it('a recorded row puts its saved test on the clipboard', async () => {
    await copyTest(recorded)
    expect(useTestClipboardStore.getState().item).toEqual({
      kind: 'recorded',
      test: {
        id: 't1',
        name: 'Login',
        url: 'https://x.test',
        steps: savedLogin.steps,
        tags: ['smoke']
      }
    })
    expect(api.readTestFile).not.toHaveBeenCalled()
  })

  it('a code row puts its file text on the clipboard, read by main', async () => {
    await copyTest(code)
    expect(api.readTestFile).toHaveBeenCalledWith('/p', 'spec/api/api_spec.rb')
    expect(useTestClipboardStore.getState().item).toEqual({
      kind: 'code',
      name: 'API',
      fileText: 'describe',
      relFile: 'spec/api/api_spec.rb'
    })
  })

  it('a failed read leaves the clipboard as it was', async () => {
    api.readTestFile.mockResolvedValue({ success: false, error: 'no' })
    await copyTest(code)
    expect(useTestClipboardStore.getState().item).toBeNull()
    expect(mockToast.error).toHaveBeenCalled()
  })
})

describe('pasteTest', () => {
  it('saves a recorded test as a new one: fresh id, unique name, its tags', async () => {
    await copyTest(recorded)
    await pasteTest(null)
    const [projectPath, test] = api.saveRecording.mock.calls[0]
    expect(projectPath).toBe('/p')
    expect(test.id).not.toBe('t1')
    expect(test).toMatchObject({
      name: 'Login copy',
      url: 'https://x.test',
      steps: savedLogin.steps
    })
    expect(api.setTestTags).toHaveBeenCalledWith('spec/login_copy_spec.rb', ['smoke'])
    expect(api.listProjectTests).toHaveBeenCalled()
  })

  it('writes a code test through main, next to the selected row', async () => {
    await copyTest(code)
    await pasteTest(recorded)
    expect(api.pasteTestFile).toHaveBeenCalledWith('/p', {
      text: 'describe',
      sourceFile: 'spec/api/api_spec.rb',
      nearFile: 'spec/login_spec.rb',
      name: 'API copy'
    })
  })

  it('loads the list first when it has not loaded, so the name is unique', async () => {
    await copyTest(code)
    useTestsListStore.setState({ rows: null })
    api.listProjectTests.mockResolvedValue([{ ...code, name: 'API copy' }])
    await pasteTest(null)
    expect(api.pasteTestFile.mock.calls[0][1].name).toBe('API copy 2')
  })

  it('warns when the tags could not be copied', async () => {
    await copyTest(recorded)
    api.setTestTags.mockResolvedValue({ success: false, error: 'no' })
    await pasteTest(null)
    expect(mockToast).toHaveBeenCalledWith(en.tests.menu.tagsNotCopied, expect.anything())
  })

  it('skips tagging when the project changed during the save', async () => {
    await copyTest(recorded)
    api.saveRecording.mockImplementation(async (_p, test) => {
      useProjectStore.setState({ projectPath: '/other' })
      return { success: true, test: { ...test, file: 'spec/login_copy_spec.rb' } }
    })
    await pasteTest(null)
    expect(api.setTestTags).not.toHaveBeenCalled()
  })

  it('says so when the tag filter hides the new test', async () => {
    await copyTest(code)
    api.listProjectTests.mockResolvedValue([
      { name: 'API copy', file: 'spec/api/api_copy_spec.rb', ownership: 'code', tags: [] }
    ])
    await pasteTest(null, { activeTag: 'smoke' })
    renderUndoToast()
    expect(document.body.textContent).toContain(
      en.tests.menu.hiddenByTag.replace('{{tag}}', 'smoke')
    )
  })

  it('Undo after a project switch does nothing, and the switch dismisses the toast', async () => {
    await copyTest(code)
    await pasteTest(null)
    mockToast.dismiss.mockClear()
    act(() => useProjectStore.setState({ projectPath: '/other' }))
    expect(mockToast.dismiss).toHaveBeenCalled()
    await clickUndo()
    expect(api.trashTest).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(en.tests.menu.undoOtherProject)
  })

  it('Undo announces the trashed test so an open page can leave it', async () => {
    const trashed = vi.fn()
    const off = onTestTrashed(trashed)
    await copyTest(code)
    await pasteTest(null)
    await clickUndo()
    off()
    expect(trashed).toHaveBeenCalledWith(['file:spec/api/api_copy_spec.rb'])
  })

  it("the toast's Undo moves the new file to the Trash", async () => {
    await copyTest(code)
    await pasteTest(null)
    await clickUndo()
    expect(api.trashTest).toHaveBeenCalledWith('/p', 'spec/api/api_copy_spec.rb')
  })

  it('does nothing with an empty clipboard or no project', async () => {
    await pasteTest(null)
    useProjectStore.setState({ projectPath: null })
    useTestClipboardStore.setState({
      item: { kind: 'code', name: 'A', fileText: '', relFile: 'spec/a_spec.rb' }
    })
    await pasteTest(null)
    expect(api.pasteTestFile).not.toHaveBeenCalled()
    expect(api.saveRecording).not.toHaveBeenCalled()
  })

  it('a refused save says so', async () => {
    await copyTest(recorded)
    api.saveRecording.mockResolvedValue({ success: false, error: 'no' })
    await pasteTest(null)
    expect(mockToast.error).toHaveBeenCalled()
  })
})

describe('duplicateTest', () => {
  it('copies and pastes in place without touching the clipboard', async () => {
    await duplicateTest(code)
    expect(api.pasteTestFile).toHaveBeenCalledWith('/p', {
      text: 'describe',
      sourceFile: 'spec/api/api_spec.rb',
      nearFile: 'spec/api/api_spec.rb',
      name: 'API copy'
    })
    expect(useTestClipboardStore.getState().item).toBeNull()
  })
})

describe('trashTestRow', () => {
  it('moves the file to the Trash, says so and announces it', async () => {
    const trashed = vi.fn()
    const off = onTestTrashed(trashed)
    api.trashTest.mockResolvedValue({ success: true, testId: 't1' })
    expect(await trashTestRow(recorded)).toBe(true)
    off()
    expect(trashed).toHaveBeenCalledWith(['file:spec/login_spec.rb', 'id:t1'])
    expect(api.trashTest).toHaveBeenCalledWith('/p', 'spec/login_spec.rb')
    expect(mockToast.success).toHaveBeenCalledWith('Moved to the Trash.')
    expect(api.listProjectTests).toHaveBeenCalled()
  })

  it('a failure is reported and returns false', async () => {
    api.trashTest.mockResolvedValue({ success: false, error: 'no' })
    expect(await trashTestRow(code)).toBe(false)
    expect(mockToast.error).toHaveBeenCalled()
  })
})
