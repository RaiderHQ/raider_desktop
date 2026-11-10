import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router'
import toast from 'react-hot-toast'
import en from '../../src/renderer/src/assets/translations/en.json'
import FlowsPane from '@components/Flows/FlowsPane'
import FlowRow from '@components/Flows/FlowRow'
import RunFlowModal from '@components/Flows/RunFlowModal'
import ScheduleModal, { buildSchedule } from '@components/Flows/ScheduleModal'
import FlowSecretsModal from '@components/Flows/FlowSecretsModal'
import {
  lastResultText,
  mergeFlows,
  nextRunText,
  scheduleText,
  type FlowRowData
} from '@components/Flows/flowText'
import useRubyStore from '@foundation/Stores/rubyStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { toRouteParam } from '@foundation/testKey'
import { validateSchedule } from '@shared/flows'
import type { FlowLastRun, GemSchedule } from '@shared/types/flows'
import type { ProjectFlowEntry } from '@shared/types/projectTest'

/** en.json with {{placeholders}} filled, so the tests read the real copy */
const t = (key: string, options: Record<string, unknown> = {}): string => {
  const text = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en)
  if (typeof text !== 'string') return key
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''))
}

vi.mock('react-i18next', () => ({ useTranslation: (): { t: typeof t } => ({ t }) }))
vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
const mockNavigate = vi.fn()
vi.mock('react-router', async () => ({
  ...(await vi.importActual('react-router')),
  useNavigate: (): typeof mockNavigate => mockNavigate
}))

/** A local time today (or `daysAgo` before), so the text doesn't depend on the time zone */
const at = (hours: number, minutes: number, daysAgo = 0): string => {
  const d = new Date(2026, 10, 10, hours, minutes)
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString()
}
const now = new Date(2026, 10, 10, 12, 0)

const last = (patch: Partial<FlowLastRun> = {}): FlowLastRun => ({
  status: 'completed',
  finishedAt: at(8, 0),
  failedStep: null,
  resultsDir: 'flow-results/fill_hours/20261110T070000Z',
  ...patch
})

const schedule = (patch: Partial<GemSchedule> = {}): GemSchedule => ({
  name: 'fill_hours',
  every: 'weekday',
  at: '08:00',
  on: null,
  retries: 0,
  inputs: {},
  notify: false,
  nextRunAt: null,
  osState: 'ok',
  last: null,
  ...patch
})

const entry = (patch: Partial<ProjectFlowEntry> = {}): ProjectFlowEntry => ({
  name: 'Fill hours',
  file: 'flows/fill_hours_flow.rb',
  stem: 'fill_hours',
  ownership: 'recorded',
  testId: 't1',
  inputs: [{ name: 'hours', default: '8' }],
  ...patch
})

const row = (patch: Partial<FlowRowData> = {}): FlowRowData => ({
  name: 'fill_hours',
  title: 'Fill hours',
  inputs: [],
  testId: 't1',
  missing: false,
  last: null,
  schedule: null,
  ...patch
})

const api = {
  flowsStatus: vi.fn(),
  listProjectFlows: vi.fn(),
  listFlows: vi.fn(),
  listSchedules: vi.fn(),
  setupFlows: vi.fn(),
  scheduleFlow: vi.fn(),
  unscheduleFlow: vi.fn(),
  openFlowResults: vi.fn(),
  listFlowEnvKeys: vi.fn(),
  setFlowEnv: vi.fn(),
  removeFlowEnv: vi.fn(),
  openDocs: vi.fn(),
  startRun: vi.fn(),
  getRunDefaults: vi.fn(),
  // A project switch in the project store loads the files and activates the project
  readDirectory: vi.fn(),
  setActiveProject: vi.fn(),
  onFlowsChanged: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.values(api).forEach((f) => f.mockReset())
  ;(window as unknown as { api: typeof api }).api = api
  api.flowsStatus.mockResolvedValue({ state: 'ready' })
  api.listProjectFlows.mockResolvedValue([])
  api.listFlows.mockResolvedValue({ flows: [] })
  api.listSchedules.mockResolvedValue({ schedules: [] })
  api.startRun.mockResolvedValue({ runId: 'r1' })
  api.getRunDefaults.mockResolvedValue({ recommendedWorkers: 2, maxWorkers: 4 })
  api.openFlowResults.mockResolvedValue({ success: true })
  api.readDirectory.mockResolvedValue([])
  api.setActiveProject.mockResolvedValue({ success: true })
  api.onFlowsChanged.mockReturnValue(vi.fn())
  useRubyStore.setState({ rubyCommand: 'ruby' })
  useProjectStore.setState({ projectPath: '/proj' })
  useRunStore.setState({ run: null, origin: null, lastFlow: null, isActive: false })
  localStorage.clear()
})

const renderPane = async (): Promise<void> => {
  await act(async () => {
    render(
      <MemoryRouter>
        <FlowsPane />
      </MemoryRouter>
    )
  })
}

const renderRow = (data: FlowRowData, onChanged = vi.fn()): void => {
  render(
    <MemoryRouter>
      <ul>
        <FlowRow row={data} now={now} onChanged={onChanged} />
      </ul>
    </MemoryRouter>
  )
}

describe('FlowsPane states', () => {
  it('shows nothing without a project', async () => {
    api.flowsStatus.mockResolvedValue({ state: 'no-project' })
    await renderPane()
    expect(screen.queryByTestId('flows-pane')).toBeNull()
  })

  it('says how to update an old ruby_raider', async () => {
    api.flowsStatus.mockResolvedValue({ state: 'unsupported', reason: 'gem' })
    await renderPane()
    expect(screen.getByTestId('flows-message')).toHaveTextContent(
      "Flows need ruby_raider 4.1 or later. Update this project's Gemfile pin to ~> 4.1 and run bundle update ruby_raider."
    )
  })

  it('says flows need a web project', async () => {
    api.flowsStatus.mockResolvedValue({ state: 'unsupported', reason: 'project' })
    await renderPane()
    expect(screen.getByText('Flows need a Selenium web project.')).toBeInTheDocument()
  })

  it('sets flows up, then refreshes', async () => {
    api.flowsStatus.mockResolvedValueOnce({ state: 'needs-setup' })
    api.setupFlows.mockResolvedValue({ ok: true })
    await renderPane()
    expect(screen.getByText(en.flows.setupIntro)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set up flows' }))
    })
    expect(api.setupFlows).toHaveBeenCalledWith('ruby')
    expect(api.flowsStatus).toHaveBeenCalledTimes(2)
    expect(screen.getByText(en.flows.empty)).toBeInTheDocument()
  })

  it("shows the gem's message when setting up fails", async () => {
    api.flowsStatus.mockResolvedValue({ state: 'needs-setup' })
    api.setupFlows.mockResolvedValue({ error: 'refused', message: 'Gemfile is locked' })
    await renderPane()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Set up flows' }))
    })
    expect(toast.error).toHaveBeenCalledWith('Gemfile is locked')
  })

  it('offers New flow and Learn more when there are no flows', async () => {
    await renderPane()
    expect(
      screen.getByText(
        'No flows yet. A flow is a recording with no checks that does a job for you.'
      )
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'New flow' }))
    expect(mockNavigate).toHaveBeenCalledWith('/overview/tests/new', { state: { kind: 'flow' } })
    fireEvent.click(screen.getByRole('button', { name: /flows in the documentation/ }))
    expect(api.openDocs).toHaveBeenCalledWith('docs.flows')
  })

  it('merges the project flows with their last results and schedules', async () => {
    api.listProjectFlows.mockResolvedValue([entry()])
    api.listFlows.mockResolvedValue({
      flows: [{ name: 'fill_hours', file: 'flows/fill_hours_flow.rb', last: last() }]
    })
    api.listSchedules.mockResolvedValue({ schedules: [schedule()] })
    await renderPane()
    const flow = screen.getByTestId('flow-row-fill_hours')
    expect(within(flow).getByText('Fill hours')).toBeInTheDocument()
    expect(within(flow).getByTestId('flow-last')).toHaveTextContent('Completed 08:00 today')
    expect(within(flow).getByTestId('flow-schedule')).toHaveTextContent('Every weekday at 08:00')
    expect(api.listFlows).toHaveBeenCalledWith('ruby')
  })

  it('still lists the flows when the gem lists fail, and says so', async () => {
    api.listProjectFlows.mockResolvedValue([entry()])
    api.listSchedules.mockResolvedValue({ error: 'timeout' })
    await renderPane()
    expect(screen.getByTestId('flow-row-fill_hours')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(en.flows.cliFailed)
  })

  it('drops an older answer that lands after a newer one', async () => {
    let answerFirst: (v: unknown) => void = () => {}
    api.listProjectFlows
      .mockReturnValueOnce(new Promise((resolve) => (answerFirst = resolve)))
      .mockResolvedValue([entry({ name: 'New answer' })])
    await renderPane()
    // The window coming to the front starts a second refresh, which answers first
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(screen.getByText('New answer')).toBeInTheDocument()
    await act(async () => {
      answerFirst([entry({ name: 'Old answer' })])
    })
    expect(screen.queryByText('Old answer')).toBeNull()
  })

  it('refreshes when main says the flows changed, and unsubscribes on unmount', async () => {
    const off = vi.fn()
    api.onFlowsChanged.mockReturnValue(off)
    api.listProjectFlows.mockResolvedValueOnce([]).mockResolvedValue([entry({ name: 'Ran' })])
    let unmount: () => void = () => {}
    await act(async () => {
      ;({ unmount } = render(
        <MemoryRouter>
          <FlowsPane />
        </MemoryRouter>
      ))
    })
    expect(screen.queryByText('Ran')).toBeNull()
    const listener = api.onFlowsChanged.mock.calls[api.onFlowsChanged.mock.calls.length - 1][0]
    await act(async () => listener())
    expect(screen.getByText('Ran')).toBeInTheDocument()
    unmount()
    expect(off).toHaveBeenCalled()
  })
})

describe('flow texts', () => {
  it('words the last result', () => {
    expect(lastResultText(t, null, now)).toBe('Not run yet')
    expect(lastResultText(t, last(), now)).toBe('Completed 08:00 today')
    expect(
      lastResultText(
        t,
        last({ status: 'failed', failedStep: { number: 4, title: 'Save', line: 9 } }),
        now
      )
    ).toBe('Failed at step 4, 08:00 today')
    expect(
      lastResultText(t, last({ status: 'failed', failedStep: { title: 'x', line: 7 } }), now)
    ).toBe('Failed at line 7, 08:00 today')
    expect(lastResultText(t, last({ status: 'setup_error' }), now)).toBe(
      'Could not start, 08:00 today'
    )
    expect(lastResultText(t, last({ finishedAt: at(8, 0, 1) }), now)).toBe(
      'Completed 08:00 yesterday'
    )
  })

  it('words each schedule preset', () => {
    expect(scheduleText(t, schedule({ every: 'weekday' }))).toBe('Every weekday at 08:00')
    expect(scheduleText(t, schedule({ every: 'hour', at: '00:15' }))).toBe('Every hour at :15')
    expect(scheduleText(t, schedule({ every: 'day' }))).toBe('Every day at 08:00')
    expect(scheduleText(t, schedule({ every: 'week', on: 'mon' }))).toBe('Every Monday at 08:00')
    expect(scheduleText(t, schedule({ notify: true }))).toBe(
      'Every weekday at 08:00, notify on failure'
    )
  })

  it('words the next run in local time', () => {
    // Tuesday 10 Nov 2026, 08:00 local
    const next = new Date(2026, 10, 10, 8, 0).toISOString()
    expect(nextRunText(t, next)).toBe('Next run Tue 08:00')
    expect(nextRunText(t, null)).toBeNull()
  })

  it('keeps a schedule whose flow is gone as a row', () => {
    const rows = mergeFlows([], [], [schedule({ name: 'gone' })])
    expect(rows).toEqual([expect.objectContaining({ name: 'gone', missing: true })])
  })
})

describe('FlowRow', () => {
  it('opens a run results folder', async () => {
    renderRow(row({ last: last() }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'View results' }))
    })
    expect(api.openFlowResults).toHaveBeenCalledWith(
      'fill_hours',
      'flow-results/fill_hours/20261110T070000Z'
    )
  })

  it('shows the schedule and its next run', () => {
    renderRow(row({ schedule: schedule({ nextRunAt: new Date(2026, 10, 10, 8).toISOString() }) }))
    expect(screen.getByTestId('flow-schedule')).toHaveTextContent(
      'Every weekday at 08:00 · Next run Tue 08:00'
    )
    expect(screen.queryByRole('button', { name: 'Schedule…' })).toBeNull()
  })

  it('stops a schedule', async () => {
    api.unscheduleFlow.mockResolvedValue({ ok: true })
    const onChanged = vi.fn()
    renderRow(row({ schedule: schedule() }), onChanged)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stop schedule' }))
    })
    expect(api.unscheduleFlow).toHaveBeenCalledWith('ruby', 'fill_hours')
    expect(onChanged).toHaveBeenCalled()
  })

  it('warns about the OS entry and re-schedules with the values filled in', () => {
    renderRow(row({ schedule: schedule({ osState: 'missing from launchd', every: 'day' }) }))
    expect(screen.getByTestId('flow-os-state')).toHaveTextContent(
      'The schedule needs attention: missing from launchd'
    )
    fireEvent.click(screen.getByRole('button', { name: 'Re-schedule' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Schedule Fill hours')
    expect(screen.getByLabelText('Repeat')).toHaveValue('day')
  })

  it('offers only Stop schedule when the OS lost the flow', () => {
    renderRow(row({ schedule: schedule({ osState: 'flow not found: unschedule' }) }))
    expect(screen.getByTestId('flow-os-state')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Re-schedule' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop schedule' })).toBeInTheDocument()
  })

  it('offers only Stop schedule when the flow file is gone', () => {
    renderRow(row({ missing: true, schedule: schedule({ osState: 'missing from launchd' }) }))
    expect(screen.queryByRole('button', { name: 'Re-schedule' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Run' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop schedule' })).toBeInTheDocument()
  })

  it('runs a flow with no inputs at once, headless', async () => {
    renderRow(row())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    })
    expect(api.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: 'files', files: ['flows/fill_hours_flow.rb'] },
        flow: { name: 'fill_hours', inputs: {}, headed: false }
      })
    )
  })

  it('disables Run while a run is going, with a tooltip', () => {
    useRunStore.setState({ isActive: true })
    renderRow(row({ inputs: [{ name: 'hours', default: '8' }] }))
    const run = screen.getByRole('button', { name: 'Run…' })
    expect(run).toBeDisabled()
    fireEvent.focus(run)
    expect(screen.getByRole('tooltip')).toHaveTextContent(en.tooltips.flows.runBusy)
  })

  it('Edit opens the recorded flow on its test page', () => {
    renderRow(row())
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Fill hours' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(mockNavigate).toHaveBeenCalledWith(`/overview/tests/${toRouteParam('id:t1')}`)
  })

  it('has no Edit for a flow written in code', () => {
    renderRow(row({ testId: undefined }))
    fireEvent.click(screen.getByRole('button', { name: 'More actions for Fill hours' }))
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull()
    expect(screen.getByRole('menuitem', { name: 'Secrets…' })).toBeInTheDocument()
  })
})

describe('RunFlowModal', () => {
  it('passes the inputs and headed through runStore.start', async () => {
    const onClose = vi.fn()
    render(
      <RunFlowModal
        name="fill_hours"
        title="Fill hours"
        inputs={[{ name: 'hours', default: '8' }]}
        onClose={onClose}
      />
    )
    const field = screen.getByLabelText('hours')
    expect(field).toHaveValue('8')
    fireEvent.change(field, { target: { value: '6' } })
    fireEvent.click(screen.getByLabelText('Show the browser'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    })
    expect(api.startRun).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: { kind: 'files', files: ['flows/fill_hours_flow.rb'] },
        flow: { name: 'fill_hours', inputs: { hours: '6' }, headed: true }
      })
    )
    expect(useRunStore.getState().origin).toEqual({ route: '/overview', label: 'Fill hours' })
    expect(useRunStore.getState().lastFlow).toEqual({
      name: 'fill_hours',
      inputs: { hours: '6' },
      headed: true
    })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('ScheduleModal', () => {
  it('builds a valid schedule for each preset', () => {
    const base = { time: '08:00', day: 'tue' as const, retries: 2, notify: true, inputs: {} }
    expect(validateSchedule(buildSchedule({ ...base, every: 'hour', time: '15' }))).toEqual({
      every: 'hour',
      at: '00:15',
      retries: 2,
      notify: true,
      inputs: {}
    })
    for (const every of ['day', 'weekday'] as const) {
      expect(validateSchedule(buildSchedule({ ...base, every }))).toEqual(
        expect.objectContaining({ every, at: '08:00' })
      )
      expect(buildSchedule({ ...base, every })).not.toHaveProperty('on')
    }
    expect(validateSchedule(buildSchedule({ ...base, every: 'week' }))).toEqual(
      expect.objectContaining({ every: 'week', at: '08:00', on: 'tue' })
    )
  })

  const renderModal = (onScheduled = vi.fn()): void => {
    render(
      <ScheduleModal
        name="fill_hours"
        title="Fill hours"
        inputs={[{ name: 'hours', default: '8' }]}
        schedule={null}
        onClose={vi.fn()}
        onScheduled={onScheduled}
      />
    )
  }

  it('sends an hourly schedule with notify on by default', async () => {
    api.scheduleFlow.mockResolvedValue({ ok: true, message: 'Scheduled fill_hours' })
    const onScheduled = vi.fn()
    renderModal(onScheduled)
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'hour' } })
    fireEvent.change(screen.getByLabelText('Minute past the hour'), { target: { value: '15' } })
    expect(screen.getByText(en.flows.scheduleModal.inputsHint)).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    })
    expect(api.scheduleFlow).toHaveBeenCalledWith('ruby', 'fill_hours', {
      every: 'hour',
      at: '00:15',
      retries: 0,
      notify: true,
      inputs: { hours: '8' }
    })
    expect(toast.success).toHaveBeenCalledWith('Scheduled fill_hours')
    expect(onScheduled).toHaveBeenCalled()
  })

  it('shows a bad time inline and does not send', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('Time'), { target: { value: '25:00' } })
    expect(screen.getByRole('alert')).toHaveTextContent(en.flows.scheduleModal.timeInvalid)
    expect(screen.getByRole('button', { name: 'Schedule' })).toBeDisabled()
  })

  it('asks for a day on a weekly schedule', async () => {
    api.scheduleFlow.mockResolvedValue({ ok: true, message: '' })
    renderModal()
    fireEvent.change(screen.getByLabelText('Repeat'), { target: { value: 'week' } })
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: 'fri' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    })
    expect(api.scheduleFlow).toHaveBeenCalledWith(
      'ruby',
      'fill_hours',
      expect.objectContaining({ every: 'week', on: 'fri' })
    )
  })

  it("shows the gem's refusal", async () => {
    api.scheduleFlow.mockResolvedValue({ error: 'refused', message: 'Ruby not found' })
    renderModal()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Schedule' }))
    })
    expect(screen.getByTestId('schedule-error')).toHaveTextContent('Ruby not found')
  })
})

describe('FlowSecretsModal', () => {
  it('lists the keys and never shows a value after saving', async () => {
    api.listFlowEnvKeys.mockResolvedValue({ keys: ['TEST_USER'] })
    api.setFlowEnv.mockResolvedValue({ keys: ['TEST_USER', 'RAIDER_SECRET_PIN'] })
    await act(async () => {
      render(<FlowSecretsModal onClose={vi.fn()} />)
    })
    expect(screen.getByTestId('secret-keys')).toHaveTextContent('TEST_USER')
    expect(screen.getByText(en.flows.secrets.explain)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'RAIDER_SECRET_PIN' } })
    const value = screen.getByLabelText('Value')
    expect(value).toHaveAttribute('type', 'password')
    fireEvent.change(value, { target: { value: 's3cret-1234' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save secret' }))
    })
    expect(api.setFlowEnv).toHaveBeenCalledWith({ key: 'RAIDER_SECRET_PIN', value: 's3cret-1234' })
    expect(screen.getByLabelText('Value')).toHaveValue('')
    expect(screen.getByTestId('secret-keys')).toHaveTextContent('RAIDER_SECRET_PIN')
    expect(document.body.innerHTML).not.toContain('s3cret-1234')
  })

  it('refuses a key main would refuse', async () => {
    api.listFlowEnvKeys.mockResolvedValue({ keys: [] })
    await act(async () => {
      render(<FlowSecretsModal onClose={vi.fn()} />)
    })
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'PASSWORD' } })
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'x' } })
    expect(screen.getByRole('alert')).toHaveTextContent(en.flows.secrets.keyInvalid)
    expect(screen.getByRole('button', { name: 'Save secret' })).toBeDisabled()
  })

  it('removes a key after asking', async () => {
    api.listFlowEnvKeys.mockResolvedValue({ keys: ['TEST_USER'] })
    api.removeFlowEnv.mockResolvedValue({ keys: [] })
    await act(async () => {
      render(<FlowSecretsModal onClose={vi.fn()} />)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Remove TEST_USER' }))
    expect(api.removeFlowEnv).not.toHaveBeenCalled()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    })
    expect(api.removeFlowEnv).toHaveBeenCalledWith({ key: 'TEST_USER' })
    await waitFor(() => expect(screen.getByText(en.flows.secrets.empty)).toBeInTheDocument())
  })
})
