import { WindowApi } from '@foundation/Types/window'

declare global {
  interface Window {
    api: WindowApi
  }
}
