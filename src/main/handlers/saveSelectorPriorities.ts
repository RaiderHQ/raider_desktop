import { appState } from './appState'

export default function saveSelectorPriorities(priorities: string[]): { success: boolean } {
  appState.selectorPriorities = priorities
  return { success: true }
}
