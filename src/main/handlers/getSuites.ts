import { appState } from './appState'
import type { Suite } from '@foundation/Types/suite'

export default (): Suite[] => {
  return Array.from(appState.suites.values())
}
