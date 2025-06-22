import { appState } from './appState'

export default (_event: Electron.IpcMainEvent, url: string) => {
  appState.projectBaseUrl = url
  return { success: true }
};
