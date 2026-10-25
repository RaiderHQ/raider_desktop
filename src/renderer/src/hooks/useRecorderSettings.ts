import { useEffect, useState } from 'react'
import useProjectStore from '@foundation/Stores/projectStore'

interface RecorderWaits {
  implicitWait: number
  setImplicitWait: (value: number) => void
  explicitWait: number
  setExplicitWait: (value: number) => void
  /** True once the project's settings have loaded; until then the waits are only defaults */
  loaded: boolean
}

/** Wait settings from the open project's config, re-loaded when the project changes. */
export function useRecorderSettings(): RecorderWaits {
  const projectPath = useProjectStore((s) => s.projectPath)
  // Same defaults as the project config (implicit 0, explicit 10)
  const [implicitWait, setImplicitWait] = useState(0)
  const [explicitWait, setExplicitWait] = useState(10)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    window.api
      .getRecorderSettings()
      .then((settings) => {
        if (cancelled) return
        setImplicitWait(settings.implicitWait)
        setExplicitWait(settings.explicitWait)
        setLoaded(true)
      })
      .catch((error) => console.error('Error loading recorder settings:', error))
    return (): void => {
      cancelled = true
    }
  }, [projectPath])

  return { implicitWait, setImplicitWait, explicitWait, setExplicitWait, loaded }
}
