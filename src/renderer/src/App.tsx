import { useEffect, useState } from 'react'
import Router from './Router'
import LoadingScreen from '@components/LoadingScreen'
import useVersionStore from '@foundation/Stores/versionStore'
import InstallGuide from '@pages/Info/InstallGuide'

const App = (): JSX.Element => {
  const [isLoading, setLoading] = useState<boolean>(true)
  const [isValid, setIsValid] = useState<boolean>(false)
  const [rubyMissing, setRubyMissing] = useState<boolean>(false)
  const [rubyVersion, setRubyVersion] = useState<string | null>(null)
  const [allureMissing, setAllureMissing] = useState<boolean>(false)

  useEffect((): void => {
    const checkDependencies = async (): Promise<void> => {
      let allureOk = false

      const rubyResult = await window.api.isRubyInstalled()
      const rubyOk = rubyResult.success
      setRubyVersion(rubyResult.rubyVersion ?? null)
      setRubyMissing(!rubyResult.success)

      const hasRaider = await window.api.runCommand('raider version')
      await useVersionStore.getState().loadVersion()
      if (!hasRaider.success) {
        const installResult = await window.api.installRaider()
        if (!installResult.success) {
          setIsValid(false)
          setLoading(false)
          return
        }
      }

      const allureResult = await window.api.runCommand('allure --version')
      allureOk = allureResult.success
      setAllureMissing(!allureOk)

      console.log(rubyOk)
      setIsValid(rubyOk && allureOk)
      setLoading(false)
    }

    checkDependencies()
  }, [])

  if (isLoading) {
    return <LoadingScreen shouldPersist={false} />
  }

  if (!isValid) {
    return (
      <InstallGuide
        rubyMissing={rubyMissing}
        rubyVersion={rubyVersion}
        allureMissing={allureMissing}
      />
    )
  }

  return (
    <>
      <LoadingScreen />
      <Router />
    </>
  )
}

export default App
