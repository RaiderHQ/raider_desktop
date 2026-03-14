import { useEffect } from 'react'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { Suite } from '@foundation/Types/suite'

export function useSuiteSync(): void {
  const { setSuites, setActiveSuiteId, setActiveTest } = useRecorderStore.getState()

  useEffect(() => {
    window.api.getSuites().then((initialSuites: Suite[]) => {
      setSuites(initialSuites)
      if (initialSuites.length > 0) {
        const firstSuite = initialSuites[0]
        setActiveSuiteId(firstSuite.id)
        setActiveTest(firstSuite.tests[0] ?? null)
      }
    })

    const suiteUpdatedCleanup = window.electron.ipcRenderer.on(
      'suite-updated',
      (_event, updatedSuites: Suite[]) => {
        const { suites: previousSuites, activeSuiteId: currentSuiteId, activeTest: currentTest } =
          useRecorderStore.getState()
        const currentTestId = currentTest?.id

        setSuites(updatedSuites)

        if (updatedSuites.length > previousSuites.length) {
          const newSuite = updatedSuites.find(
            (s) => !previousSuites.some((ps) => ps.id === s.id)
          )
          if (newSuite) {
            setActiveSuiteId(newSuite.id)
            setActiveTest(newSuite.tests[0] ?? null)
            return
          }
        }

        const activeSuiteNow = updatedSuites.find((s) => s.id === currentSuiteId)

        if (activeSuiteNow) {
          const activeTestNow = activeSuiteNow.tests.find((t) => t.id === currentTestId)
          if (activeTestNow) {
            if (JSON.stringify(currentTest) !== JSON.stringify(activeTestNow)) {
              setActiveTest(activeTestNow)
            }
          } else {
            setActiveTest(activeSuiteNow.tests[0] ?? null)
          }
        } else if (currentSuiteId) {
          const firstSuite = updatedSuites[0] ?? null
          setActiveSuiteId(firstSuite?.id ?? null)
          setActiveTest(firstSuite?.tests[0] ?? null)
        }
      }
    )

    return (): void => {
      suiteUpdatedCleanup?.()
    }
  }, [])
}
