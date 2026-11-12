import { render, screen, fireEvent, act, within, waitFor, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import toast from 'react-hot-toast'
import en from '@assets/translations/en.json'
import SchedulesPanel from '@components/Schedules/SchedulesPanel'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useTickedTestsStore } from '@foundation/Stores/tickedTestsStore'
import type { TestRow } from '@foundation/testKey'
import type { GemSchedule, GemScheduleRule, SchedulesStatus } from '@shared/types/schedules'

// The real copy (with i18next's _one/_other plurals)
const lookup = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
const translate = (key: string, options: Record<string, string | number> = {}): string => {
  const plural =
    typeof options.count === 'number'
      ? lookup(`${key}_${options.count === 1 ? 'one' : 'other'}`)
      : undefined
  const value = plural ?? lookup(key)
  if (typeof value !== 'string') return key
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''))
}
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: typeof translate } => ({ t: translate })
}))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast, Toaster: (): null => null }
})

const PROJECT = '/p'

const rule = (patch: Partial<GemScheduleRule> = {}): GemScheduleRule => ({
  name: 'all_tests',
  every: 'weekday',
  at: '08:00',
  on: null,
  retries: 0,
  notify: true,
  showBrowser: false,
  selection: { kind: 'all' },
  // Wednesday 11 Nov 2026, 08:00 local
  nextRunAt: new Date(2026, 10, 11, 8, 0).toISOString(),
  osState: 'ok',
  last: null,
  ...patch
})

const testRows: TestRow[] = [
  { name: 'Login', file: 'spec/login_spec.rb', ownership: 'code', tags: ['smoke'] },
  { name: 'Cart', file: 'spec/cart_spec.rb', ownership: 'code', tags: ['checkout', 'smoke'] }
]

const status = (patch: Partial<SchedulesStatus> = {}): SchedulesStatus => ({
  supported: true,
  version: '4.2.0',
  oldSchedules: false,
  platform: 'darwin',
  ...patch
})

const api = {
  schedulesStatus: vi.fn(),
  listSchedules: vi.fn(),
  addSchedule: vi.fn(),
  removeSchedule: vi.fn(),
  openScheduleReport: vi.fn(),
  openDocs: vi.fn(),
  // The project store tells main about a project switch
  setActiveProject: vi.fn(),
  readDirectory: vi.fn()
}
const startSchedule = vi.fn()

const list = (schedules: GemSchedule[], notice: string | null = null): void => {
  api.listSchedules.mockResolvedValue({ notice, schedules })
}

const renderPanel = async (
  props: React.ComponentProps<typeof SchedulesPanel> = {}
): Promise<ReturnType<typeof render>> => {
  let view!: ReturnType<typeof render>
  await act(async () => {
    view = render(<SchedulesPanel {...props} />)
  })
  return view
}

const toggle = (): HTMLElement => screen.getByTestId('schedules-toggle')
const row = (name: string): HTMLElement => screen.getByTestId(`schedule-row-${name}`)

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  Object.values(api).forEach((f) => f.mockReset())
  api.setActiveProject.mockResolvedValue({ success: true })
  api.readDirectory.mockResolvedValue([])
  api.schedulesStatus.mockResolvedValue(status())
  list([])
  // @ts-expect-error - Mocking window.api
  window.api = api
  useProjectStore.setState({ projectPath: PROJECT })
  useRubyStore.setState({ rubyCommand: 'ruby' })
  useTestsListStore.setState({ rows: testRows })
  useTickedTestsStore.setState({ byProject: {} })
  useRunStore.setState({ isActive: false, startSchedule })
})

afterEach(() => {
  cleanup()
  useProjectStore.setState({ projectPath: null })
})

describe('SchedulesPanel', () => {
  it('on an older ruby_raider says scheduling needs 4.2, without Schedule…', async () => {
    api.schedulesStatus.mockResolvedValue(status({ supported: false, version: '4.1.0' }))
    const onSupportedChange = vi.fn()
    await renderPanel({ onSupportedChange })
    fireEvent.click(toggle())
    expect(screen.getByText(en.schedules.panel.needsUpdate)).toBeInTheDocument()
    expect(screen.getByText(en.schedules.panel.updateHint)).toBeInTheDocument()
    expect(screen.queryByText(en.schedules.panel.oldSchedules)).toBeNull()
    expect(screen.queryByRole('button', { name: en.schedules.panel.schedule })).toBeNull()
    expect(api.listSchedules).not.toHaveBeenCalled()
    expect(onSupportedChange).toHaveBeenLastCalledWith(false)
  })

  it('mentions 4.1 schedules when the project still has them', async () => {
    api.schedulesStatus.mockResolvedValue(status({ supported: false, oldSchedules: true }))
    await renderPanel()
    fireEvent.click(toggle())
    expect(screen.getByText(en.schedules.panel.oldSchedules)).toBeInTheDocument()
  })

  it('starts collapsed with no schedules and remembers being opened, per project', async () => {
    const onSupportedChange = vi.fn()
    const view = await renderPanel({ onSupportedChange })
    expect(onSupportedChange).toHaveBeenLastCalledWith(true)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(toggle()).toHaveTextContent('Schedules')
    expect(screen.queryByTestId('schedules-body')).toBeNull()
    fireEvent.click(toggle())
    expect(screen.getByText(en.schedules.panel.empty)).toBeInTheDocument()
    view.unmount()
    await renderPanel()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    // Another project keeps its own default
    view.unmount()
    useProjectStore.setState({ projectPath: '/other' })
    const other = await renderPanel()
    expect(within(other.container).getByTestId('schedules-toggle')).toHaveAttribute(
      'aria-expanded',
      'false'
    )
  })

  it('still renders when storage throws', async () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await renderPanel()
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    get.mockRestore()
    set.mockRestore()
  })

  it('lists schedules open, with count, soonest next run and each row', async () => {
    const now = new Date()
    list([
      rule({
        last: {
          status: 'failed',
          finishedAt: now.toISOString(),
          trigger: 'schedule',
          counts: { total: 40, passed: 37, failed: 3, skipped: 0 }
        }
      }),
      rule({
        name: 'tag_smoke',
        every: 'hour',
        at: '00:15',
        notify: false,
        showBrowser: true,
        selection: { kind: 'tag', tag: 'smoke' },
        nextRunAt: new Date(2026, 10, 12, 9, 15).toISOString()
      }),
      rule({
        name: 'picked',
        selection: { kind: 'files', files: ['spec/a_spec.rb', 'spec/b_spec.rb'] },
        nextRunAt: null
      })
    ])
    await renderPanel()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(toggle()).toHaveTextContent('Schedules (3)')
    expect(screen.getByText('· next Wed 08:00')).toBeInTheDocument()
    expect(row('all_tests')).toHaveTextContent(
      'All tests · Every weekday at 08:00 · Next run Wed 08:00'
    )
    expect(row('all_tests')).toHaveTextContent(
      /Failed 3 of 40 · \d\d:\d\d today · notify on failure/
    )
    expect(row('tag_smoke')).toHaveTextContent(
      'Tag smoke · Every hour at :15 · browser shown · Next run Thu 09:15'
    )
    expect(row('tag_smoke')).toHaveTextContent('Not run yet')
    expect(row('tag_smoke')).not.toHaveTextContent('notify on failure')
    expect(row('picked')).toHaveTextContent('2 tests · Every weekday at 08:00')
  })

  it('Run now starts the schedule; View report opens it or says there is none', async () => {
    list([rule()])
    await renderPanel()
    fireEvent.click(within(row('all_tests')).getByRole('button', { name: 'Run now' }))
    expect(startSchedule).toHaveBeenCalledWith('all_tests', {
      route: '/overview/tests',
      label: 'all_tests'
    })
    api.openScheduleReport.mockResolvedValue({ error: 'noReport' })
    await act(async () => {
      fireEvent.click(within(row('all_tests')).getByRole('button', { name: 'View report' }))
    })
    expect(api.openScheduleReport).toHaveBeenCalledWith('all_tests')
    expect(toast.error).toHaveBeenCalledWith(en.schedules.errors.noReport)
  })

  it('Run now waits while a run is going', async () => {
    list([rule()])
    useRunStore.setState({ isActive: true })
    await renderPanel()
    expect(within(row('all_tests')).getByRole('button', { name: 'Run now' })).toBeDisabled()
  })

  it('Stop schedule removes it and lists again', async () => {
    list([rule()])
    api.removeSchedule.mockResolvedValue({ ok: true, message: 'Removed', notice: null })
    await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for all_tests' }))
    list([])
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Stop schedule' }))
    })
    expect(api.removeSchedule).toHaveBeenCalledWith('ruby', 'all_tests')
    expect(toast.success).toHaveBeenCalledWith('Stopped all_tests.')
    expect(api.listSchedules).toHaveBeenCalledTimes(2)
    expect(screen.queryByTestId('schedule-row-all_tests')).toBeNull()
  })

  it('a refused Stop shows the gem line', async () => {
    list([rule()])
    api.removeSchedule.mockResolvedValue({ error: 'refused', message: 'No schedule all_tests' })
    await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for all_tests' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Stop schedule' }))
    })
    expect(toast.error).toHaveBeenCalledWith('No schedule all_tests')
  })

  it('keeps the 4.1 cleanup notice, even collapsed, until Dismiss', async () => {
    const notice = 'Removed 1 schedule made with Ruby Raider 4.1 (log_hours).'
    list([], notice)
    const view = await renderPanel()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('schedules-notice')).toHaveTextContent(notice)
    view.unmount()
    // The gem says it once; the next list has none
    list([])
    await renderPanel()
    expect(screen.getByTestId('schedules-notice')).toHaveTextContent(notice)
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByTestId('schedules-notice')).toBeNull()
    expect(localStorage.getItem(`schedulesNotice:${PROJECT}`)).toBeNull()
  })

  it('keeps a notice an add or remove returned', async () => {
    list([rule()])
    api.removeSchedule.mockResolvedValue({ ok: true, message: '', notice: 'Removed old ones' })
    await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for all_tests' }))
    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: 'Stop schedule' }))
    })
    expect(screen.getByTestId('schedules-notice')).toHaveTextContent('Removed old ones')
  })

  it('an OS problem offers Re-schedule with the row settings', async () => {
    list([rule({ osState: 'missing from launchd', showBrowser: true })])
    api.addSchedule.mockResolvedValue({ ok: true, message: '', notice: null })
    await renderPanel()
    expect(row('all_tests')).toHaveTextContent('Schedule problem: missing from launchd.')
    await act(async () => {
      fireEvent.click(within(row('all_tests')).getByRole('button', { name: 'Re-schedule' }))
    })
    expect(api.addSchedule).toHaveBeenCalledWith('ruby', {
      name: 'all_tests',
      every: 'weekday',
      at: '08:00',
      retries: 0,
      notify: true,
      showBrowser: true,
      selection: { kind: 'all' }
    })
    expect(api.listSchedules).toHaveBeenCalledTimes(2)
  })

  it('a schedule without a rule offers only Stop', async () => {
    list([{ name: 'gone', orphan: true, osState: 'missing from schedules.yml', last: null }])
    await renderPanel()
    expect(row('gone')).toHaveTextContent('Schedule problem: missing from schedules.yml.')
    expect(within(row('gone')).queryByRole('button', { name: 'Re-schedule' })).toBeNull()
    expect(within(row('gone')).queryByRole('button', { name: 'Run now' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for gone' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Stop schedule'])
  })

  it('a missing test file offers Edit, which drops the files that are gone', async () => {
    list([
      rule({
        name: 'picked',
        osState: 'test file not found: spec/gone_spec.rb',
        selection: {
          kind: 'files',
          files: ['spec/login_spec.rb', 'spec/gone_spec.rb', 'spec/old_spec.rb']
        }
      })
    ])
    api.addSchedule.mockResolvedValue({ ok: true, message: '', notice: null })
    await renderPanel()
    expect(row('picked')).toHaveTextContent('Test file not found: spec/gone_spec.rb')
    expect(within(row('picked')).queryByRole('button', { name: 'Re-schedule' })).toBeNull()
    fireEvent.click(within(row('picked')).getByRole('button', { name: 'Edit' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Edit picked')
    expect(screen.getByTestId('schedule-files-dropped')).toHaveTextContent(
      '2 missing test files were left out.'
    )
    expect(screen.getByLabelText('Ticked test (1)')).toBeChecked()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    })
    expect(api.addSchedule).toHaveBeenCalledWith(
      'ruby',
      expect.objectContaining({
        name: 'picked',
        selection: { kind: 'files', files: ['spec/login_spec.rb'] }
      })
    )
  })

  it('Edit from the menu pre-fills; tags come from the tests list', async () => {
    list([rule({ selection: { kind: 'tag', tag: 'smoke' }, name: 'tag_smoke' })])
    await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'More actions for tag_smoke' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(screen.getByLabelText('Tag')).toHaveValue('smoke')
    const options = screen.getByTestId('schedule-tag-options').querySelectorAll('option')
    expect([...options].map((o) => o.getAttribute('value'))).toEqual(['checkout', 'smoke'])
  })

  it('Schedule… opens the dialog; saving lists again and keeps a notice', async () => {
    useTickedTestsStore.setState({ byProject: { [PROJECT]: ['spec/cart_spec.rb'] } })
    api.addSchedule.mockResolvedValue({ ok: true, message: '', notice: 'Removed old ones' })
    await renderPanel()
    fireEvent.click(screen.getByRole('button', { name: 'Schedule…' }))
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('All tests')).toBeChecked()
    expect(screen.getByLabelText('Ticked test (1)')).not.toBeDisabled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    })
    expect(api.addSchedule).toHaveBeenCalledWith(
      'ruby',
      expect.objectContaining({ name: 'all_tests', selection: { kind: 'all' } })
    )
    expect(api.listSchedules).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('schedules-notice')).toHaveTextContent('Removed old ones')
  })

  it('opens the dialog with the ticked files the Tests list sent', async () => {
    const onPendingTaken = vi.fn()
    await renderPanel({ pendingFiles: ['spec/login_spec.rb', 'spec/cart_spec.rb'], onPendingTaken })
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
    expect(onPendingTaken).toHaveBeenCalled()
    expect(screen.getByLabelText('Ticked tests (2)')).toBeChecked()
    expect(screen.getByLabelText('Name')).toHaveValue('selected_tests')
  })

  it('Learn more opens the scheduling page', async () => {
    await renderPanel()
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Learn more about scheduling tests in the documentation'
      })
    )
    expect(api.openDocs).toHaveBeenCalledWith('docs.scheduling')
  })

  it('maps a list error to copy', async () => {
    api.listSchedules.mockResolvedValue({ error: 'rubyCantRun' })
    await renderPanel()
    fireEvent.click(toggle())
    expect(screen.getByRole('alert')).toHaveTextContent(en.schedules.errors.rubyCantRun)
  })

  it('says Ruby is missing instead of listing', async () => {
    useRubyStore.setState({ rubyCommand: null })
    await renderPanel()
    fireEvent.click(toggle())
    expect(screen.getByRole('alert')).toHaveTextContent(en.schedules.noRuby)
    expect(api.listSchedules).not.toHaveBeenCalled()
  })
})
