import type { MobilePlatform } from './projectLayout'

export interface DeviceFields {
  deviceName: string
  platformVersion: string
  app: string
  automationName: string
}

export type DeviceEdit = Partial<Pick<DeviceFields, 'deviceName' | 'platformVersion' | 'app'>>

export type DeviceSettings = {
  platform: MobilePlatform
  /** Cross-platform projects only: which platform a run uses */
  runOn?: 'ios' | 'android'
  ios?: DeviceFields
  android?: DeviceFields
}

export type DeviceSettingsChange =
  | { block: 'top' | 'ios' | 'android'; edit: DeviceEdit }
  | { runOn: 'ios' | 'android' }

/** Whether a mobile project can run now: its app file exists and Appium answers */
export type MobileReady = { ok: true } | { ok: false; reason: 'appium' | 'app'; detail: string }
