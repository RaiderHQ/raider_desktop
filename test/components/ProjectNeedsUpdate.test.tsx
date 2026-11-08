import { render, screen, within, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ProjectNeedsUpdate from '@components/ProjectNeedsUpdate'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import type { ProjectLayout } from '@shared/types/projectLayout'
import type { UpgradeResult } from '@shared/types/upgradeResult'
import en from '@assets/translations/en.json'

// The real copy, so the message and the confirmation can be checked word for word
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
  Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() })
)
vi.mock('react-hot-toast', () => ({
  default: mockToast,
  toast: mockToast,
  Toaster: (): null => null
}))

const showErrorToast = vi.hoisted(() => vi.fn())
vi.mock('@foundation/errorToast', () => ({ showErrorToast }))

const oldLayout: ProjectLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: false,
  unsupportedReason: 'gemTooOld',
  runtimeSupported: false,
  rubyRaiderVersion: '3.15.2'
}
const updatedLayout: ProjectLayout = {
  ...oldLayout,
  recordable: true,
  unsupportedReason: undefined,
  rubyRaiderVersion: '4.0.0'
}

const api = {
  upgradeRubyRaider: vi.fn(),
  setActiveProject: vi.fn(),
  readDirectory: vi.fn()
}

/** A promise the test settles itself, to look at the page while the update is pending. */
const deferred = <T,>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const openProject = async (path = '/p/shop'): Promise<void> => {
  await act(async () => {
    // Switching project resets the layout, so the layout is set once the switch has settled
    useProjectStore.setState({ projectPath: path })
  })
  useProjectStore.setState({ layout: oldLayout })
}

const button = (): HTMLElement => screen.getByRole('button', { name: en.projectUpdate.button })
const dialog = (): HTMLElement => document.getElementById('confirm-modal-overlay')!
const confirm = async (): Promise<void> => {
  await act(async () => {
    fireEvent.click(within(dialog()).getByRole('button', { name: en.projectUpdate.button }))
  })
}

beforeEach(async () => {
  vi.clearAllMocks()
  api.setActiveProject.mockResolvedValue({ success: true, layout: oldLayout })
  api.readDirectory.mockResolvedValue([])
  // @ts-expect-error - Mocking window.api
  window.api = api
  useRubyStore.setState({ rubyCommand: 'ruby' })
  await openProject()
})

describe('ProjectNeedsUpdate', () => {
  it('names the locked version and the fix', () => {
    render(<ProjectNeedsUpdate />)

    const notice = screen.getByTestId('project-needs-update')
    expect(notice).toHaveAttribute('role', 'alert')
    expect(notice).toHaveTextContent(en.projectUpdate.title)
    expect(notice).toHaveTextContent('It uses ruby_raider 3.15.2.')
    expect(button()).toBeEnabled()
  })

  it('does not pretend to know the version when the lock could not be read', () => {
    useProjectStore.setState({ layout: { ...oldLayout, rubyRaiderVersion: undefined } })
    render(<ProjectNeedsUpdate />)

    expect(screen.getByText(en.projectUpdate.messageUnknown)).toBeInTheDocument()
    expect(screen.queryByText(/3\.15\.2/)).not.toBeInTheDocument()
  })

  it('asks for confirmation, naming the project folder, and cancel changes nothing', () => {
    render(<ProjectNeedsUpdate />)

    fireEvent.click(button())
    expect(within(dialog()).getByText(en.projectUpdate.confirmTitle)).toBeInTheDocument()
    expect(within(dialog()).getByText(/in shop\./)).toBeInTheDocument()

    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
    expect(document.getElementById('confirm-modal-overlay')).toBeNull()
    expect(api.upgradeRubyRaider).not.toHaveBeenCalled()
    expect(useProjectStore.getState().layout).toEqual(oldLayout)
  })

  it('updates the project with the Ruby in use and shows the new layout', async () => {
    const pending = deferred<UpgradeResult>()
    api.upgradeRubyRaider.mockReturnValue(pending.promise)
    render(<ProjectNeedsUpdate />)

    fireEvent.click(button())
    await confirm()

    expect(api.upgradeRubyRaider).toHaveBeenCalledWith('/p/shop', 'ruby')
    expect(document.getElementById('confirm-modal-overlay')).toBeNull()
    const updating = screen.getByRole('button', { name: en.projectUpdate.updating })
    expect(updating).toBeDisabled()

    await act(async () => {
      pending.resolve({ success: true, layout: updatedLayout })
    })

    expect(useProjectStore.getState().layout).toEqual(updatedLayout)
    expect(mockToast.success).toHaveBeenCalledWith(en.projectUpdate.done)
    expect(showErrorToast).not.toHaveBeenCalled()
    expect(button()).toBeEnabled()
  })

  it('reports a failed update with its reason and keeps the project as it was', async () => {
    api.upgradeRubyRaider.mockResolvedValue({
      success: false,
      error: 'Bundler could not find compatible versions'
    })
    render(<ProjectNeedsUpdate />)

    fireEvent.click(button())
    await confirm()

    expect(showErrorToast).toHaveBeenCalledWith(
      en.projectUpdate.failed,
      'Bundler could not find compatible versions'
    )
    expect(mockToast.success).not.toHaveBeenCalled()
    expect(useProjectStore.getState().layout).toEqual(oldLayout)
    expect(button()).toBeEnabled()
  })

  it('reports an update that threw', async () => {
    api.upgradeRubyRaider.mockRejectedValue(new Error('IPC failed'))
    render(<ProjectNeedsUpdate />)

    fireEvent.click(button())
    await confirm()

    expect(showErrorToast).toHaveBeenCalledWith(en.projectUpdate.failed, 'Error: IPC failed')
    expect(useProjectStore.getState().layout).toEqual(oldLayout)
  })

  it('ignores an answer for a project that is no longer open', async () => {
    const pending = deferred<UpgradeResult>()
    api.upgradeRubyRaider.mockReturnValue(pending.promise)
    render(<ProjectNeedsUpdate />)

    fireEvent.click(button())
    await confirm()

    // The user opened another project while bundler was still running
    api.setActiveProject.mockResolvedValue({ success: true, layout: null })
    await act(async () => {
      useProjectStore.setState({ projectPath: '/p/other' })
    })
    const layoutBefore = useProjectStore.getState().layout

    await act(async () => {
      pending.resolve({ success: true, layout: updatedLayout })
    })

    expect(useProjectStore.getState().layout).toBe(layoutBefore)
    expect(useProjectStore.getState().layout).not.toEqual(updatedLayout)
    expect(mockToast.success).not.toHaveBeenCalled()
    expect(showErrorToast).not.toHaveBeenCalled()
  })

  it('cannot update without a Ruby and says so', async () => {
    useRubyStore.setState({ rubyCommand: null })
    render(<ProjectNeedsUpdate />)

    fireEvent.click(button())
    await confirm()

    expect(api.upgradeRubyRaider).not.toHaveBeenCalled()
    expect(mockToast.error).toHaveBeenCalledWith(en.recorder.noRuby)
  })
})
