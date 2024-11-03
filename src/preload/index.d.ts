import { ElectronAPI } from '@electron-toolkit/preload'
import { WindowApi } from '@foundation/Types/window'

declare global {
  interface Window {
    electron: ElectronAPI
    api: WindowApi
  }
}
