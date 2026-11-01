import React, { createRef } from 'react'
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import DeviceSettings from '@components/DeviceSettings'
import useProjectStore from '@foundation/Stores/projectStore'
import type { ProjectLayout } from '@shared/types/projectLayout'
import type { DeviceFields, DeviceSettings as Settings } from '@shared/types/deviceSettings'
import en from '../../src/renderer/src/assets/translations/en.json'

// Resolves keys against en.json, so the tests check the real copy
const lookup = (key: string): string =>
  key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en) as string
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: lookup })
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('react-hot-toast', () => ({
  default: {
    error: (m: string): void => toastError(m),
    success: (m: string): void => toastSuccess(m)
  }
}))

const PROJECT = '/projects/shop-app'

const layout = (mobilePlatform: ProjectLayout['mobilePlatform']): ProjectLayout => ({
  framework: 'rspec',
  automation: 'appium',
  mobilePlatform,
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  recordable: false,
  unsupportedReason: 'mobile'
})

const iosFields: DeviceFields = {
  deviceName: 'iPhone 15',
  platformVersion: '17.0',
  app: 'RaiderTestApp.app',
  automationName: 'XCUITest'
}
const androidFields: DeviceFields = {
  deviceName: 'Pixel 8 API 34',
  platformVersion: '14',
  app: 'app.apk',
  automationName: 'UiAutomator2'
}

const api = {
  getDeviceSettings: vi.fn(),
  saveDeviceSettings: vi.fn(),
  checkMobileReady: vi.fn(),
  chooseAppFile: vi.fn(),
  // Opening a project in the store activates it and lists its files
  setActiveProject: vi.fn().mockResolvedValue({ success: true }),
  readDirectory: vi.fn().mockResolvedValue([])
}

beforeEach(() => {
  vi.clearAllMocks()
  api.getDeviceSettings.mockResolvedValue({ platform: 'ios', ios: iosFields } satisfies Settings)
  api.saveDeviceSettings.mockResolvedValue({ ok: true })
  api.checkMobileReady.mockResolvedValue({ ok: true })
  api.chooseAppFile.mockResolvedValue({ cancelled: true })
  // @ts-expect-error - partial window.api
  window.api = api
  useProjectStore.setState({ projectPath: PROJECT })
})

const renderSection = async (
  platform: ProjectLayout['mobilePlatform'] = 'ios',
  focusRef?: React.Ref<HTMLElement>
): Promise<void> => {
  await act(async () => {
    render(<DeviceSettings projectPath={PROJECT} layout={layout(platform)} focusRef={focusRef} />)
  })
}

describe('DeviceSettings, single platform', () => {
  it('shows one group of fields with the driver as read-only text', async () => {
    await renderSection()
    expect(screen.getByRole('heading', { name: 'Device' })).toBeInTheDocument()
    expect(screen.getAllByLabelText('Device name')).toHaveLength(1)
    expect(screen.getByLabelText('Device name')).toHaveValue('iPhone 15')
    expect(screen.getByLabelText('OS version')).toHaveValue('17.0')
    expect(screen.getByLabelText('App file')).toHaveValue('RaiderTestApp.app')
    expect(screen.getByText('XCUITest')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Driver' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('shows the help text for device name and OS version', async () => {
    await renderSection()
    expect(screen.getByLabelText('Device name')).toHaveAccessibleDescription(
      'The simulator, emulator or phone name, for example iPhone 15.'
    )
    expect(screen.getByLabelText('OS version')).toHaveAccessibleDescription('For example 17.0 or 14.')
  })

  it('saves an edited device name on blur, then says it saved', async () => {
    await renderSection()
    const input = screen.getByLabelText('Device name')
    fireEvent.change(input, { target: { value: 'iPhone 16' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(api.saveDeviceSettings).toHaveBeenCalledWith(PROJECT, {
      block: 'top',
      edit: { deviceName: 'iPhone 16' }
    })
    expect(toastSuccess).toHaveBeenCalledWith('Saved')
  })

  it('saves on Enter', async () => {
    await renderSection()
    const input = screen.getByLabelText('OS version')
    fireEvent.change(input, { target: { value: '18.0' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(api.saveDeviceSettings).toHaveBeenCalledWith(PROJECT, {
      block: 'top',
      edit: { platformVersion: '18.0' }
    })
  })

  it('never saves an empty field', async () => {
    await renderSection()
    const input = screen.getByLabelText('Device name')
    fireEvent.change(input, { target: { value: '   ' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(api.saveDeviceSettings).not.toHaveBeenCalled()
  })

  it('does not save a field that did not change', async () => {
    await renderSection()
    await act(async () => {
      fireEvent.blur(screen.getByLabelText('Device name'))
    })
    expect(api.saveDeviceSettings).not.toHaveBeenCalled()
  })

  it('shows its own message when a save fails, never the raw error', async () => {
    api.saveDeviceSettings.mockResolvedValue({ error: 'The device settings could not be saved.' })
    await renderSection()
    const input = screen.getByLabelText('Device name')
    fireEvent.change(input, { target: { value: 'iPhone 16' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(toastError).toHaveBeenCalledWith("Couldn't save the device settings.")
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('saves once when Enter is followed by a blur', async () => {
    let resolveSave: (value: { ok: true }) => void = () => {}
    api.saveDeviceSettings.mockImplementationOnce(
      () => new Promise((resolve) => (resolveSave = resolve))
    )
    await renderSection()
    const input = screen.getByLabelText('Device name')
    fireEvent.change(input, { target: { value: 'iPhone 16' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
      fireEvent.blur(input)
    })
    await act(async () => resolveSave({ ok: true }))
    expect(api.saveDeviceSettings).toHaveBeenCalledTimes(1)
    expect(toastSuccess).toHaveBeenCalledTimes(1)
  })

  it('saves the same value again after a failed save', async () => {
    api.saveDeviceSettings.mockResolvedValueOnce({ error: 'x' })
    await renderSection()
    const input = screen.getByLabelText('Device name')
    fireEvent.change(input, { target: { value: 'iPhone 16' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
    })
    expect(api.saveDeviceSettings).toHaveBeenCalledTimes(2)
  })

  it('puts an emptied field back to the saved value without saving', async () => {
    await renderSection()
    const input = screen.getByLabelText('App file')
    fireEvent.change(input, { target: { value: '' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(input).toHaveValue('RaiderTestApp.app')
    expect(api.saveDeviceSettings).not.toHaveBeenCalled()
  })

  it('ignores a save that finishes after the project changed', async () => {
    let resolveSave: (value: { ok: true }) => void = () => {}
    api.saveDeviceSettings.mockImplementationOnce(
      () => new Promise((resolve) => (resolveSave = resolve))
    )
    await renderSection()
    const input = screen.getByLabelText('Device name')
    fireEvent.change(input, { target: { value: 'iPhone 16' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    await act(async () => {
      useProjectStore.setState({ projectPath: '/projects/other' })
    })
    await act(async () => resolveSave({ ok: true }))
    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('ignores a failed save that finishes after the project changed', async () => {
    let resolveSave: (value: { error: string }) => void = () => {}
    api.saveDeviceSettings.mockImplementationOnce(
      () => new Promise((resolve) => (resolveSave = resolve))
    )
    await renderSection()
    const input = screen.getByLabelText('Device name')
    fireEvent.change(input, { target: { value: 'iPhone 16' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    await act(async () => {
      useProjectStore.setState({ projectPath: '/projects/other' })
    })
    await act(async () => resolveSave({ error: 'This project is not open.' }))
    expect(toastError).not.toHaveBeenCalled()
  })

  it('saves Android fields to the top block', async () => {
    api.getDeviceSettings.mockResolvedValue({ platform: 'android', android: androidFields })
    await renderSection('android')
    expect(screen.getByText('UiAutomator2')).toBeInTheDocument()
    const input = screen.getByLabelText('Device name')
    fireEvent.change(input, { target: { value: 'Pixel 9' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(api.saveDeviceSettings).toHaveBeenCalledWith(PROJECT, {
      block: 'top',
      edit: { deviceName: 'Pixel 9' }
    })
  })
})

describe('DeviceSettings, cross-platform', () => {
  beforeEach(() => {
    api.getDeviceSettings.mockResolvedValue({
      platform: 'cross_platform',
      runOn: 'ios',
      ios: iosFields,
      android: androidFields
    } satisfies Settings)
  })

  it('shows a Run on choice and an iOS and an Android group', async () => {
    await renderSection('cross_platform')
    const runOn = screen.getByRole('radiogroup', { name: 'Run on' })
    expect(within(runOn).getByRole('radio', { name: 'iOS' })).toHaveAttribute('aria-checked', 'true')
    const ios = screen.getByRole('group', { name: 'iOS' })
    const android = screen.getByRole('group', { name: 'Android' })
    expect(within(ios).getByLabelText('Device name')).toHaveValue('iPhone 15')
    expect(within(android).getByLabelText('Device name')).toHaveValue('Pixel 8 API 34')
  })

  it('saves Run on when it changes', async () => {
    await renderSection('cross_platform')
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Android' }))
    })
    expect(api.saveDeviceSettings).toHaveBeenCalledWith(PROJECT, { runOn: 'android' })
    expect(screen.getByRole('radio', { name: 'Android' })).toHaveAttribute('aria-checked', 'true')
    // The other platform's app file is the one a run now needs
    expect(api.checkMobileReady).toHaveBeenCalledTimes(2)
  })

  it('puts Run on back when the save fails', async () => {
    api.saveDeviceSettings.mockResolvedValue({ error: 'nope' })
    await renderSection('cross_platform')
    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Android' }))
    })
    expect(screen.getByRole('radio', { name: 'iOS' })).toHaveAttribute('aria-checked', 'true')
    expect(toastError).toHaveBeenCalledWith("Couldn't save the device settings.")
  })

  it('saves each group to its own block', async () => {
    await renderSection('cross_platform')
    const iosName = within(screen.getByRole('group', { name: 'iOS' })).getByLabelText('Device name')
    fireEvent.change(iosName, { target: { value: 'iPhone 16' } })
    await act(async () => {
      fireEvent.blur(iosName)
    })
    const androidVersion = within(screen.getByRole('group', { name: 'Android' })).getByLabelText(
      'OS version'
    )
    fireEvent.change(androidVersion, { target: { value: '15' } })
    await act(async () => {
      fireEvent.blur(androidVersion)
    })
    expect(api.saveDeviceSettings).toHaveBeenCalledWith(PROJECT, {
      block: 'ios',
      edit: { deviceName: 'iPhone 16' }
    })
    expect(api.saveDeviceSettings).toHaveBeenCalledWith(PROJECT, {
      block: 'android',
      edit: { platformVersion: '15' }
    })
  })

  it('marks only the platform that runs as missing its app file', async () => {
    api.checkMobileReady.mockResolvedValue({ ok: false, reason: 'app', detail: 'RaiderTestApp.app' })
    await renderSection('cross_platform')
    expect(
      within(screen.getByRole('group', { name: 'iOS' })).getByText("Can't find this file")
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Android' })).queryByText("Can't find this file")
    ).not.toBeInTheDocument()
  })
})

describe('DeviceSettings, app file', () => {
  it('asks for the app file and flags the path when the check cannot find it', async () => {
    api.checkMobileReady.mockResolvedValue({ ok: false, reason: 'app', detail: 'RaiderTestApp.app' })
    await renderSection()
    expect(screen.getByText('Choose the app file to test before running.')).toBeInTheDocument()
    expect(screen.getByText("Can't find this file")).toBeInTheDocument()
  })

  it('asks for the app file when none is set, without flagging an empty field', async () => {
    api.getDeviceSettings.mockResolvedValue({ platform: 'ios', ios: { ...iosFields, app: '' } })
    api.checkMobileReady.mockResolvedValue({ ok: false, reason: 'app', detail: '' })
    await renderSection()
    expect(screen.getByText('Choose the app file to test before running.')).toBeInTheDocument()
    expect(screen.queryByText("Can't find this file")).not.toBeInTheDocument()
  })

  it.each([
    ['ready', { ok: true }],
    ['Appium not running', { ok: false, reason: 'appium', detail: '127.0.0.1:4723' }],
    ['check failed', { error: "Couldn't check this project." }]
  ])('treats the app as present when the check says %s', async (_name, result) => {
    api.checkMobileReady.mockResolvedValue(result)
    await renderSection()
    expect(screen.queryByText('Choose the app file to test before running.')).not.toBeInTheDocument()
    expect(screen.queryByText("Can't find this file")).not.toBeInTheDocument()
  })

  it('fills in and saves the file picked with Choose…, then checks again', async () => {
    api.checkMobileReady
      .mockResolvedValueOnce({ ok: false, reason: 'app', detail: 'RaiderTestApp.app' })
      .mockResolvedValue({ ok: true })
    api.chooseAppFile.mockResolvedValue({ path: 'builds/My App.app' })
    await renderSection()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose…' }))
    })
    expect(api.chooseAppFile).toHaveBeenCalledWith(PROJECT, 'ios')
    expect(screen.getByLabelText('App file')).toHaveValue('builds/My App.app')
    expect(api.saveDeviceSettings).toHaveBeenCalledWith(PROJECT, {
      block: 'top',
      edit: { app: 'builds/My App.app' }
    })
    expect(api.checkMobileReady).toHaveBeenCalledTimes(2)
    expect(screen.queryByText("Can't find this file")).not.toBeInTheDocument()
    expect(screen.queryByText('Choose the app file to test before running.')).not.toBeInTheDocument()
  })

  it('says to pick an app file when a plain folder was chosen', async () => {
    api.chooseAppFile.mockResolvedValue({ error: 'not-an-app' })
    await renderSection()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose…' }))
    })
    expect(toastError).toHaveBeenCalledWith('Choose an .app, .ipa, .apk or .aab file.')
    expect(api.saveDeviceSettings).not.toHaveBeenCalled()
  })

  it.each([
    ['returns an error', (): void => void api.chooseAppFile.mockResolvedValue({ error: 'boom' })],
    ['throws', (): void => void api.chooseAppFile.mockRejectedValue(new Error('ipc down'))]
  ])('says the picker could not open when the dialog %s', async (_name, arrange) => {
    arrange()
    await renderSection()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose…' }))
    })
    expect(toastError).toHaveBeenCalledWith("Couldn't open the file picker.")
    expect(api.saveDeviceSettings).not.toHaveBeenCalled()
  })

  it('saves nothing when Choose… is cancelled', async () => {
    api.chooseAppFile.mockResolvedValue({ cancelled: true })
    await renderSection()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Choose…' }))
    })
    expect(api.saveDeviceSettings).not.toHaveBeenCalled()
    expect(screen.getByLabelText('App file')).toHaveValue('RaiderTestApp.app')
  })

  it('picks with the Android filters for the Android group', async () => {
    api.getDeviceSettings.mockResolvedValue({
      platform: 'cross_platform',
      runOn: 'ios',
      ios: iosFields,
      android: androidFields
    })
    api.chooseAppFile.mockResolvedValue({ path: 'builds/app.apk' })
    await renderSection('cross_platform')
    const android = screen.getByRole('group', { name: 'Android' })
    await act(async () => {
      fireEvent.click(within(android).getByRole('button', { name: 'Choose…' }))
    })
    expect(api.chooseAppFile).toHaveBeenCalledWith(PROJECT, 'android')
    expect(api.saveDeviceSettings).toHaveBeenCalledWith(PROJECT, {
      block: 'android',
      edit: { app: 'builds/app.apk' }
    })
  })

  it('checks again after a typed app file saves', async () => {
    await renderSection()
    const input = screen.getByLabelText('App file')
    fireEvent.change(input, { target: { value: 'other.app' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(api.checkMobileReady).toHaveBeenCalledTimes(2)
  })
})

describe('DeviceSettings, read error', () => {
  it('shows the read-error line and no inputs', async () => {
    api.getDeviceSettings.mockResolvedValue({ error: 'The device settings could not be read.' })
    await renderSection()
    expect(
      screen.getByText("Couldn't read this project's device settings (config/capabilities.yml).")
    ).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText('The device settings could not be read.')).not.toBeInTheDocument()
  })

  it('shows the read-error line when the layout could not tell the platform', async () => {
    await act(async () => {
      render(<DeviceSettings projectPath={PROJECT} layout={layout(undefined)} />)
    })
    expect(
      screen.getByText("Couldn't read this project's device settings (config/capabilities.yml).")
    ).toBeInTheDocument()
    expect(api.getDeviceSettings).not.toHaveBeenCalled()
  })

  it('shows the read-error line when the call throws', async () => {
    api.getDeviceSettings.mockRejectedValue(new Error('ipc down'))
    await renderSection()
    expect(
      screen.getByText("Couldn't read this project's device settings (config/capabilities.yml).")
    ).toBeInTheDocument()
  })
})

describe('DeviceSettings, focusRef', () => {
  it('points at the App file field of the platform that runs', async () => {
    api.getDeviceSettings.mockResolvedValue({
      platform: 'cross_platform',
      runOn: 'android',
      ios: iosFields,
      android: androidFields
    })
    const ref = createRef<HTMLElement>()
    await renderSection('cross_platform', ref)
    const android = screen.getByRole('group', { name: 'Android' })
    expect(ref.current).toBe(within(android).getByLabelText('App file'))
  })

  it('points at the Device heading when the settings cannot be read', async () => {
    api.getDeviceSettings.mockResolvedValue({ error: 'x' })
    const ref = createRef<HTMLElement>()
    await renderSection('ios', ref)
    expect(ref.current).toBe(screen.getByRole('heading', { name: 'Device' }))
    await waitFor(() => expect(ref.current).toHaveAttribute('tabindex', '-1'))
  })
})
