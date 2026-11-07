import Router from './Router'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'

// Expose Zustand stores on window for e2e test access.
// This is safe — stores are read/write singletons; no secrets are exposed.
;(window as any).__TEST_STORES__ = {
  projectStore: useProjectStore,
  rubyStore: useRubyStore,
  recorderStore: useRecorderStore,
  testsListStore: useTestsListStore
}

const App = (): JSX.Element => {
  return (
    <>
      <Router />
    </>
  )
}

export default App
