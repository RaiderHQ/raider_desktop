import { appState } from './appState'

export default () => {
  return Array.from(appState.suites.values())
}
