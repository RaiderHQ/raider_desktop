import { useEffect, useState } from 'react'
import useProjectStore from '@foundation/Stores/projectStore'

interface RecorderWaits {
  implicitWait: number
  setImplicitWait: (value: number) => void
  explicitWait: number
  setExplicitWait: (value: number) => void
}

/** Wait settings from the open project's config, re-loaded when the project changes. */
export function useRecorderSettings(): RecorderWaits {
  const projectPath = useProjectStore((s) => s.projectPath)
  const [implicitWait, setImplicitWait] = useState(0)
  const [explicitWait, setExplicitWait] = useState(30)

  useEffect(() => {
    let cancelled = false
    window.api
      .getRecorderSettings()
      .then((settings) => {
        if (cancelled) return
        setImplicitWait(settings.implicitWait)
        setExplicitWait(settings.explicitWait)
      })
      .catch((error) => console.error('Error loading recorder settings:', error))
    return (): void => {
      cancelled = true
    }
  }, [projectPath])

  return { implicitWait, setImplicitWait, explicitWait, setExplicitWait }
}
