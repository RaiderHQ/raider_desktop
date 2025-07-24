import { appState } from './appState'

export default function getSelectorPriorities(): string[] {
  return appState.selectorPriorities
}
