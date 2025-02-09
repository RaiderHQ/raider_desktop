import { useEffect, useState } from 'react'
import { Toaster } from 'react-hot-toast'
import Router from './Router'
import LoadingScreen from '@components/LoadingScreen'
import { isVersionValid } from '@foundation/helpers'
import useVersionStore from '@foundation/Stores/versionStore'
import InstallGuide from '@pages/Info/InstallGuide'

const App = (): JSX.Element => {
  const [isLoading, setLoading] = useState<boolean>(true)
  const [isValid, setIsValid] = useState<boolean>(false)

  useEffect((): void => {
    const checkDependencies = async (): Promise<void> => {
      const result = await window.api.runCommand('ruby -v')

      if (!result.success) {
        setLoading(false)
        setIsValid(false)
        return
      }

      const isValid = isVersionValid(result.output, 3, '>=')
      if (!isValid) {
        setLoading(false)
        setIsValid(false)
        return
      }

      const hasRaider = await window.api.runCommand('raider version')
      useVersionStore.getState().loadVersion()
      if (hasRaider.success) {
        setIsValid(true)
        setLoading(false)
        return
      }

      const installResult = await window.api.installRaider()
      if (!installResult.success) {
        setIsValid(false)
        setLoading(false)
        return
      }

      setIsValid(true)
      setLoading(false)
    }

    checkDependencies()
  }, [])

  if (isLoading) {
    return <LoadingScreen shouldPersist={false} />
  }

  if (!isValid) {
    return <InstallGuide />
  }

  return (
    <>
      <Toaster position="top-right" reverseOrder={false} />
      <LoadingScreen />
      <Router />
    </>
  )
}

export default App
