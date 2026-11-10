import type { ElectronApplication, Page } from '@playwright/test'
import { test, expect } from './electronApp'
import { goToOverview, mockRubyReady } from './helpers/navigation'
import { setupProjectContext } from './helpers/ipc-mock'
import { mockRunner, getStartRequests, started } from './helpers/run-mock'

// The Flows tab against stubbed main channels: no gem and no scheduler ever runs here.
// Every flow channel answers from globalThis.__flowState and logs its arguments to
// globalThis.__flowCalls, which the tests read back to check what the tab asked main for.

interface FlowState {
  status: { state: string }
  entries: unknown[]
  flows: unknown[]
  schedules: { name: string }[]
  envKeys: string[]
}

interface FlowCall {
  channel: string
  args: unknown[]
}

type FlowStubGlobal = typeof globalThis & { __flowState: FlowState; __flowCalls: FlowCall[] }

const logHours = {
  name: 'Log hours',
  file: 'flows/log_hours_flow.rb',
  stem: 'log_hours',
  ownership: 'recorded',
  testId: 'f1',
  inputs: [{ name: 'hours', default: '8' }]
}

const failedRun = {
  status: 'failed',
  finishedAt: '2026-11-03T08:01:30',
  trigger: 'schedule',
  failedStep: { number: 4, title: 'Click Save', line: 12 },
  resultsDir: 'flow-results/log_hours/20261103-080130'
}

const weekdaySchedule = (osState: string): Record<string, unknown> => ({
  name: 'log_hours',
  every: 'weekday',
  at: '08:00',
  on: null,
  retries: 0,
  inputs: { hours: '8' },
  notify: true,
  nextRunAt: '2026-11-11T08:00:00',
  osState,
  last: failedRun
})

const READY: FlowState = {
  status: { state: 'ready' },
  entries: [logHours],
  flows: [{ name: 'log_hours', file: 'flows/log_hours_flow.rb', last: null }],
  schedules: [],
  envKeys: []
}

async function stubFlowChannels(app: ElectronApplication, state: FlowState): Promise<void> {
  await app.evaluate(({ ipcMain }, json) => {
    const g = globalThis as FlowStubGlobal
    g.__flowState = JSON.parse(json)
    g.__flowCalls = []
    // A reply reads the channel's arguments (after the event) as the renderer sent them
    type Reply = (...args: never[]) => unknown
    const answer =
      (channel: string, reply: Reply) =>
      (_event: unknown, ...args: unknown[]): unknown => {
        g.__flowCalls.push({ channel, args })
        return (reply as (...a: unknown[]) => unknown)(...args)
      }
    const handlers: Record<string, Reply> = {
      'flows-status': () => g.__flowState.status,
      'list-project-flows': () => g.__flowState.entries,
      'list-flows': () => ({ flows: g.__flowState.flows }),
      'list-schedules': () => ({ schedules: g.__flowState.schedules }),
      'setup-flows': () => {
        g.__flowState.status = { state: 'ready' }
        return { ok: true }
      },
      'schedule-flow': () => ({ ok: true, message: '' }),
      'unschedule-flow': (_ruby: string, name: string) => {
        g.__flowState.schedules = g.__flowState.schedules.filter((s) => s.name !== name)
        return { ok: true }
      },
      'open-flow-results': () => ({ success: true }),
      'flow-last-results': () => null,
      'list-flow-env-keys': () => ({ keys: g.__flowState.envKeys }),
      'set-flow-env': (entry: { key: string }) => {
        if (!g.__flowState.envKeys.includes(entry.key)) g.__flowState.envKeys.push(entry.key)
        return { keys: g.__flowState.envKeys }
      },
      'remove-flow-env': (entry: { key: string }) => {
        g.__flowState.envKeys = g.__flowState.envKeys.filter((k) => k !== entry.key)
        return { keys: g.__flowState.envKeys }
      }
    }
    for (const [channel, reply] of Object.entries(handlers)) {
      ipcMain.removeHandler(channel)
      ipcMain.handle(channel, answer(channel, reply))
    }
  }, JSON.stringify(state))
}

async function flowCalls(app: ElectronApplication, channel: string): Promise<unknown[][]> {
  return app.evaluate(
    (_electron, ch) =>
      (globalThis as FlowStubGlobal).__flowCalls.filter((c) => c.channel === ch).map((c) => c.args),
    channel
  )
}

async function openFlowsTab(app: ElectronApplication, page: Page, state: FlowState): Promise<void> {
  await stubFlowChannels(app, state)
  await setupProjectContext(page)
  await goToOverview(page)
  await page.getByRole('button', { name: 'Flows', exact: true }).click()
  await expect(page.getByTestId('flows-pane')).toBeVisible()
}

const row = (page: Page): ReturnType<Page['getByTestId']> => page.getByTestId('flow-row-log_hours')

test.beforeEach(async ({ electronApp, page }) => {
  await mockRubyReady(electronApp, page)
})

test.describe('Flows tab', () => {
  test('sets up flows, then shows the empty state', async ({ electronApp, page }) => {
    await openFlowsTab(electronApp, page, {
      ...READY,
      status: { state: 'needs-setup' },
      entries: [],
      flows: []
    })

    await page.getByRole('button', { name: 'Set up flows' }).click()

    await expect(page.getByText(/^No flows yet/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'New flow' })).toBeVisible()
    expect(await flowCalls(electronApp, 'setup-flows')).toEqual([['ruby']])
  })

  test('shows the last failure and the schedule, and stops it', async ({ electronApp, page }) => {
    await openFlowsTab(electronApp, page, { ...READY, schedules: [weekdaySchedule('ok')] })

    await expect(row(page).getByTestId('flow-last')).toContainText('Failed at step 4,')
    const schedule = row(page).getByTestId('flow-schedule')
    await expect(schedule).toContainText('Every weekday at 08:00')
    await expect(schedule).toContainText('Next run Wed 08:00')
    await expect(row(page).getByTestId('flow-os-state')).toHaveCount(0)

    await row(page).getByRole('button', { name: 'Stop schedule' }).click()

    await expect(row(page).getByRole('button', { name: 'Schedule…' })).toBeVisible()
    expect(await flowCalls(electronApp, 'unschedule-flow')).toEqual([['ruby', 'log_hours']])
  })

  test('schedules a flow every week', async ({ electronApp, page }) => {
    await openFlowsTab(electronApp, page, READY)

    await row(page).getByRole('button', { name: 'Schedule…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Schedule Log hours' })
    await dialog.getByLabel('Repeat').selectOption('week')
    await dialog.getByLabel('Day').selectOption('mon')
    await dialog.getByLabel('Time').fill('07:30')
    await dialog.getByLabel('Retries').selectOption('1')
    await dialog.getByRole('button', { name: 'Schedule', exact: true }).click()

    await expect(dialog).toHaveCount(0)
    expect(await flowCalls(electronApp, 'schedule-flow')).toEqual([
      [
        'ruby',
        'log_hours',
        {
          every: 'week',
          at: '07:30',
          on: 'mon',
          retries: 1,
          notify: true,
          inputs: { hours: '8' }
        }
      ]
    ])
  })

  test('warns when the OS lost the schedule', async ({ electronApp, page }) => {
    await openFlowsTab(electronApp, page, {
      ...READY,
      schedules: [weekdaySchedule('missing from launchd')]
    })

    const warning = row(page).getByTestId('flow-os-state')
    await expect(warning).toContainText('The schedule needs attention: missing from launchd')
    await expect(warning.getByRole('button', { name: 'Re-schedule' })).toBeVisible()
  })

  test('saves a secret without showing its value again', async ({ electronApp, page }) => {
    const value = 'e2e-secret-value-9f3a'
    await openFlowsTab(electronApp, page, READY)

    await row(page).getByRole('button', { name: 'More actions for Log hours' }).click()
    await page.getByRole('menuitem', { name: 'Secrets…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Flow secrets' })
    await dialog.getByLabel('Name').fill('RAIDER_SECRET_TOKEN')
    await dialog.getByLabel('Value').fill(value)
    await dialog.getByRole('button', { name: 'Save secret' }).click()

    await expect(dialog.getByTestId('secret-keys')).toContainText('RAIDER_SECRET_TOKEN')
    await expect(dialog.getByLabel('Value')).toHaveValue('')
    expect(await flowCalls(electronApp, 'set-flow-env')).toEqual([
      [{ key: 'RAIDER_SECRET_TOKEN', value }]
    ])
    expect(await page.content()).not.toContain(value)
  })

  test('runs a flow with the inputs given', async ({ electronApp, page }) => {
    await mockRunner(electronApp, { events: [started()] })
    await openFlowsTab(electronApp, page, READY)

    await row(page).getByRole('button', { name: 'Run…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Run Log hours' })
    await dialog.getByLabel('hours').fill('7')
    await dialog.getByRole('button', { name: 'Run', exact: true }).click()

    await expect(dialog).toHaveCount(0)
    const [request] = await getStartRequests(electronApp)
    expect(request.scope).toEqual({ kind: 'files', files: ['flows/log_hours_flow.rb'] })
    expect(request.flow).toEqual({ name: 'log_hours', inputs: { hours: '7' }, headed: false })
  })
})
