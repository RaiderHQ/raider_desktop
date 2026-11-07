import React from 'react'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { ipcSubscriptions } from '../helpers/ipcSubscriptions'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import TestsWorkspace from '@components/TestsWorkspace'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import type { Test } from '@foundation/Types/test'
import en from '@assets/translations/en.json'

// The real copy, so labels and the toast can be checked word for word
const translate = (key: string, options: Record<string, string> = {}): string => {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  if (typeof value !== 'string') return key
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => options[name] ?? '')
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

const step = (id: string): Test['steps'][number] => ({
  id,
  kind: 'navigate',
  url: `https://x.test/${id}`
})

const search: Test = {
  id: 't1',
  name: 'Search products',
  url: 'https://x.test/search',
  steps: [step('a')],
  ownership: 'recorded'
}

const listeners = new Map<string, (...args: unknown[]) => unknown>()
const emit = async (channel: string, ...args: unknown[]): Promise<void> => {
  await act(async () => {
    await listeners.get(channel)?.(...args)
  })
}

// What main has saved so far, so the list and the tests follow the saves
let saved: Test[] = []

const api = {
  getTests: vi.fn(),
  listProjectTests: vi.fn(),
  saveRecording: vi.fn(),
  saveTrace: vi.fn(),
  getProjectConfig: vi.fn(),
  loadUrlRequest: vi.fn(),
  startRecordingMain: vi.fn(),
  stopRecordingMain: vi.fn(),
  cancelReplay: vi.fn(),
  renderStep: vi.fn(),
  setRecordingState: vi.fn(),
  setMenuRecording: vi.fn(),
  onFlushRecording: vi.fn((_cb: () => void) => (): void => {}),
  flushRecordingDone: vi.fn(),
  // Opening the project (setting its path) loads its files and activates it in main
  readDirectory: vi.fn(async () => []),
  setActiveProject: vi.fn(async () => ({ success: true }))
}

let location = ''
const Location = (): null => {
  location = useLocation().pathname
  return null
}

const renderAt = (path: string, strict = false): ReturnType<typeof render> =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Location />
      <Routes>
        <Route path="/overview/tests" element={<TestsWorkspace />} />
        <Route path="/overview/tests/new" element={<TestsWorkspace />} />
        <Route path="/overview/tests/:testKey" element={<TestsWorkspace />} />
      </Routes>
    </MemoryRouter>,
    // The app renders under StrictMode, which runs effects twice in development
    strict ? { wrapper: React.StrictMode } : undefined
  )

const startButton = (): HTMLElement => screen.getByRole('button', { name: 'Start recording' })

/** Opens the new-test page, names the test, and starts recording it the way main does. */
const startDraft = async (name = 'Add to cart'): Promise<ReturnType<typeof render>> => {
  const view = renderAt('/overview/tests/new')
  fireEvent.change(await screen.findByLabelText(en.testPage.name), { target: { value: name } })
  fireEvent.click(startButton())
  await waitFor(() => expect(api.startRecordingMain).toHaveBeenCalled())
  await emit('recording-started', 'https://x.test/home')
  return view
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  saved = []
  api.getTests.mockImplementation(async () => [search, ...saved])
  api.listProjectTests.mockImplementation(async () => [
    { name: search.name, file: 'spec/search_spec.rb', testId: 't1', ownership: 'recorded' },
    ...saved.map((s) => ({ name: s.name, file: s.file, testId: s.id, ownership: 'recorded' }))
  ])
  api.saveRecording.mockImplementation(async (_path: string, test: Test) => {
    const file = 'spec/add_to_cart_spec.rb'
    saved = [{ ...test, file, ownership: 'recorded' }]
    return { success: true, test: { ...test, file } }
  })
  api.saveTrace.mockResolvedValue({ success: true })
  api.getProjectConfig.mockResolvedValue({
    success: true,
    config: { baseUrl: 'https://shop.test' }
  })
  api.loadUrlRequest.mockResolvedValue(undefined)
  api.startRecordingMain.mockResolvedValue({
    success: true,
    url: 'https://x.test/home',
    preloadPath: '/p.js'
  })
  api.renderStep.mockImplementation(async (s: { url?: string }) => `goto ${s.url ?? ''}`)
  // @ts-expect-error - Mocking window.api
  window.api = api
  Object.assign(window.api, ipcSubscriptions(listeners))
  useRecorderStore.getState().resetForProject()
  useRecorderStore.setState({ showCode: false, isOutputVisible: false })
  useProjectStore.setState({ projectPath: '/project' })
  useTestsListStore.setState({ rows: null })
  useRunOutputStore.setState({ runOutput: '' })
})

describe('New test', () => {
  it('New test opens a form: a required name, the base URL, Start recording and Cancel', async () => {
    renderAt('/overview/tests')
    fireEvent.click(await screen.findByRole('button', { name: 'New test' }))

    expect(location).toBe('/overview/tests/new')
    const name = await screen.findByLabelText(en.testPage.name)
    expect(name).toHaveValue('')
    expect(await screen.findByDisplayValue('https://shop.test')).toHaveAccessibleName(
      en.testPage.url
    )
    expect(startButton()).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()

    fireEvent.change(name, { target: { value: '   ' } })
    expect(startButton()).toBeDisabled()
    fireEvent.change(name, { target: { value: 'Add to cart' } })
    expect(startButton()).toBeEnabled()
  })

  it('Cancel goes back without saving or adding a row', async () => {
    renderAt('/overview/tests/new')
    fireEvent.change(await screen.findByLabelText(en.testPage.name), {
      target: { value: 'Add to cart' }
    })
    // Long enough for an autosave to have fired
    await new Promise((resolve) => setTimeout(resolve, 600))

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(location).toBe('/overview/tests')
    expect(await screen.findByRole('button', { name: /Search products/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add to cart/ })).not.toBeInTheDocument()
    expect(api.saveRecording).not.toHaveBeenCalled()
    expect(api.startRecordingMain).not.toHaveBeenCalled()
  })

  it('records the named test from its URL and saves it once on stop', async () => {
    await startDraft()
    expect(api.loadUrlRequest).toHaveBeenCalledWith('https://shop.test')
    await emit('new-recorded-step', step('c1'))
    await emit('new-recorded-step', step('c2'))

    fireEvent.click(screen.getByRole('button', { name: 'Stop & save' }))

    await waitFor(() =>
      expect(mockToast.success).toHaveBeenCalledWith(
        'Saved to your project as Add to cart (spec/add_to_cart_spec.rb)'
      )
    )
    expect(api.saveRecording).toHaveBeenCalledTimes(1)
    expect(api.saveRecording).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        name: 'Add to cart',
        url: 'https://shop.test',
        steps: [expect.objectContaining({ kind: 'navigate' }), step('c1'), step('c2')]
      })
    )
    // The saved test is selected in the list
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Add to cart/ })).toHaveAttribute(
        'aria-current',
        'true'
      )
    )
    expect(useRecorderStore.getState().draftTest).toBeNull()
  })

  it('stopping with only the start page saves nothing and goes back to the list', async () => {
    await startDraft()

    fireEvent.click(screen.getByRole('button', { name: 'Stop & save' }))

    await waitFor(() => expect(location).toBe('/overview/tests'))
    expect(api.saveRecording).not.toHaveBeenCalled()
    expect(api.saveTrace).not.toHaveBeenCalled()
    expect(useRecorderStore.getState().draftTest).toBeNull()
  })

  it('leaving an empty draft by the rail saves nothing and does not throw', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await startDraft()

    fireEvent.click(screen.getByRole('button', { name: /Tests/ }))

    await waitFor(() => expect(api.stopRecordingMain).toHaveBeenCalled())
    expect(location).toBe('/overview/tests')
    expect(api.saveRecording).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('unmounting with an empty draft saves nothing and does not throw', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const view = await startDraft()

    view.unmount()

    await waitFor(() => expect(api.stopRecordingMain).toHaveBeenCalled())
    await act(async () => {})
    expect(api.saveRecording).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('closing the window with an empty draft saves nothing and does not throw', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await startDraft()
    const flush = api.onFlushRecording.mock.calls.at(-1)![0]

    await act(async () => flush())

    await waitFor(() => expect(api.flushRecordingDone).toHaveBeenCalled())
    expect(api.saveRecording).not.toHaveBeenCalled()
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
  })

  it('leaving a draft with steps saves it', async () => {
    await startDraft()
    await emit('new-recorded-step', step('c1'))

    fireEvent.click(screen.getByRole('button', { name: /Tests/ }))

    await waitFor(() => expect(api.saveRecording).toHaveBeenCalledTimes(1))
    expect(api.saveRecording).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ name: 'Add to cart' })
    )
  })

  it('never creates an Untitled Test', async () => {
    await startDraft()
    await emit('new-recorded-step', step('c1'))
    fireEvent.click(screen.getByRole('button', { name: 'Stop & save' }))
    await waitFor(() => expect(api.saveRecording).toHaveBeenCalled())
    for (const [, test] of api.saveRecording.mock.calls) {
      expect((test as Test).name).not.toBe('Untitled Test')
    }
    expect(screen.queryByText('Untitled Test')).not.toBeInTheDocument()
  })

  describe('starting (D8)', () => {
    it('an unsupported URL keeps the form and starts nothing', async () => {
      renderAt('/overview/tests/new')
      fireEvent.change(await screen.findByLabelText(en.testPage.name), {
        target: { value: 'Add to cart' }
      })
      fireEvent.change(screen.getByLabelText(en.testPage.url), { target: { value: 'ftp://nope' } })
      fireEvent.click(startButton())
      await waitFor(() =>
        expect(mockToast.error).toHaveBeenCalledWith(
          'Only http and https websites can be recorded.'
        )
      )
      expect(api.startRecordingMain).not.toHaveBeenCalled()
      expect(useRecorderStore.getState().draftTest).toBeNull()
      expect(startButton()).toBeInTheDocument()
    })

    it('a draft opened from quick record starts recording on arrival', async () => {
      useRecorderStore
        .getState()
        .startDraft('Checkout', 'https://x.test/home', { recordOnOpen: true })
      renderAt('/overview/tests/new')
      await waitFor(() => expect(api.startRecordingMain).toHaveBeenCalledTimes(1))
      expect(useRecorderStore.getState().recordOnOpen).toBe(false)
    })

    it('starts once even under StrictMode, which runs the effect twice', async () => {
      useRecorderStore
        .getState()
        .startDraft('Checkout', 'https://x.test/home', { recordOnOpen: true })
      renderAt('/overview/tests/new', true)
      await waitFor(() => expect(api.startRecordingMain).toHaveBeenCalled())
      await act(async () => {})
      expect(api.startRecordingMain).toHaveBeenCalledTimes(1)
    })

    it('a draft opened from the form does not start twice', async () => {
      await startDraft()
      expect(api.startRecordingMain).toHaveBeenCalledTimes(1)
    })
  })
})
