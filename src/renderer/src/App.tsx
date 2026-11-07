import Router from './Router'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'

// Expose Zustand stores on window for e2e test access, in development and in the e2e build
// only (`.env.e2e` sets VITE_E2E); a production build does not contain the hook.
if (import.meta.env.DEV || import.meta.env.VITE_E2E === 'true') {
  ;(window as any).__TEST_STORES__ = {
    projectStore: useProjectStore,
    rubyStore: useRubyStore,
    recorderStore: useRecorderStore,
    testsListStore: useTestsListStore
  }
}

const App = (): JSX.Element => {
  return (
    <>
      <Router />
    </>
  )
}

export default App
