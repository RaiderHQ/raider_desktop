import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import ToggleSwitch from '@components/ToggleSwitch'
import TagInput from '@components/TagInput'
import useProjectStore from '@foundation/Stores/projectStore'


const Settings: React.FC = () => {
  const { t } = useTranslation()
  const projectPath: string = useProjectStore((state) => state.projectPath) || ''
  const [mobileAppiumUrl, setMobileAppiumUrl] = useState('')
  const [mobilePlatformVersion, setMobilePlatformVersion] = useState('')
  const [mobileAutomationName, setMobileAutomationName] = useState('')
  const [mobileDeviceName, setMobileDeviceName] = useState('')
  const [mobileApp, setMobileApp] = useState('')
  const [isUpdatingMobile, setIsUpdatingMobile] = useState(false)

  const [isMobileProject, setIsMobileProject] = useState(false)
  const [loading, setLoading] = useState(true)

  // New settings state
  const [timeout, setTimeout_] = useState(30)
  const [isUpdatingTimeout, setIsUpdatingTimeout] = useState(false)

  const [debugMode, setDebugMode] = useState(false)
  const [isUpdatingDebug, setIsUpdatingDebug] = useState(false)
  const [browserOptions, setBrowserOptions] = useState<string[]>([])
  const [isUpdatingOptions, setIsUpdatingOptions] = useState(false)
  const [isStartingAppium, setIsStartingAppium] = useState(false)
  const [pagePath, setPagePath] = useState('')
  const [specPath, setSpecPath] = useState('')
  const [featurePath, setFeaturePath] = useState('')
  const [helperPath, setHelperPath] = useState('')
  const [isUpdatingPaths, setIsUpdatingPaths] = useState(false)

  useEffect(() => {
    const fetchSettings = async (): Promise<void> => {
      try {
        const result = await window.api.isMobileProject(projectPath)
        if (result.success) {
          setIsMobileProject(result.isMobileProject || false)
          if (result.isMobileProject) {
            const storedMobileAppiumUrl = localStorage.getItem('mobileAppiumUrl')
            const storedPlatformVersion = localStorage.getItem('mobilePlatformVersion')
            const storedAutomationName = localStorage.getItem('mobileAutomationName')
            const storedDeviceName = localStorage.getItem('mobileDeviceName')
            const storedMobileApp = localStorage.getItem('mobileApp')

            if (storedMobileAppiumUrl) setMobileAppiumUrl(storedMobileAppiumUrl)
            if (storedPlatformVersion) setMobilePlatformVersion(storedPlatformVersion)
            if (storedAutomationName) setMobileAutomationName(storedAutomationName)
            if (storedDeviceName) setMobileDeviceName(storedDeviceName)
            if (storedMobileApp) setMobileApp(storedMobileApp)

            if (
              !storedMobileAppiumUrl ||
              !storedPlatformVersion ||
              !storedAutomationName ||
              !storedDeviceName ||
              !storedMobileApp
            ) {
              const capResponse = await window.api.getMobileCapabilities(projectPath)
              if (capResponse.success && capResponse.capabilities) {
                const appiumOptions = capResponse.capabilities['appium:options'] as
                  | {
                      url?: string
                      platformVersion?: string
                      automationName?: string
                      deviceName?: string
                      app?: string
                    }
                  | undefined
                if (appiumOptions) {
                  if (!storedMobileAppiumUrl) setMobileAppiumUrl(appiumOptions.url || '')
                  if (!storedPlatformVersion)
                    setMobilePlatformVersion(appiumOptions.platformVersion || '')
                  if (!storedAutomationName)
                    setMobileAutomationName(appiumOptions.automationName || '')
                  if (!storedDeviceName) setMobileDeviceName(appiumOptions.deviceName || '')
                  if (!storedMobileApp) setMobileApp(appiumOptions.app || '')
                }
              }
            }
          }
        } else {
          console.error(t('settings.error.checkMobileProject'), result.error)
        }
      } catch (error) {
        console.error(t('settings.error.fetchSettings'), error)
        toast.error(`${t('settings.error.fetchSettings')} : ${error}`)
      } finally {
        setLoading(false)
      }
    }

    void fetchSettings()
  }, [projectPath, t])

  const handleMobileSettingsUpdateClick = async (): Promise<void> => {
    setIsUpdatingMobile(true)
    try {
      const capabilities = {
        url: mobileAppiumUrl,
        platformVersion: mobilePlatformVersion,
        automationName: mobileAutomationName,
        deviceName: mobileDeviceName,
        app: mobileApp
      }
      const capsResponse = await window.api.updateMobileCapabilities(projectPath, capabilities)
      if (!capsResponse.success) {
        toast.error(t('settings.error.mobileCapabilitiesUpdateFailed'))
        return
      }

      localStorage.setItem('mobileAppiumUrl', mobileAppiumUrl)
      localStorage.setItem('mobilePlatformVersion', mobilePlatformVersion)
      localStorage.setItem('mobileAutomationName', mobileAutomationName)
      localStorage.setItem('mobileDeviceName', mobileDeviceName)
      localStorage.setItem('mobileApp', mobileApp)
      toast.success(t('settings.mobile.updateSuccess'))
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')} : ${error}`)
    } finally {
      setIsUpdatingMobile(false)
    }
  }

  // New handler functions
  const handleTimeoutUpdate = async (): Promise<void> => {
    setIsUpdatingTimeout(true)
    try {
      const result = await window.api.updateTimeout(projectPath, timeout)
      if (result.success) {
        toast.success(t('settings.timeout.updateSuccess'))
      } else {
        toast.error(result.error || t('settings.error.unexpected'))
      }
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')}: ${error}`)
    } finally {
      setIsUpdatingTimeout(false)
    }
  }


  const handleDebugToggle = async (enabled: boolean): Promise<void> => {
    setDebugMode(enabled)
    setIsUpdatingDebug(true)
    try {
      const result = await window.api.updateDebugMode(projectPath, enabled)
      if (result.success) {
        toast.success(t('settings.debug.updateSuccess'))
      } else {
        toast.error(result.error || t('settings.error.unexpected'))
        setDebugMode(!enabled)
      }
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')}: ${error}`)
      setDebugMode(!enabled)
    } finally {
      setIsUpdatingDebug(false)
    }
  }

  const handleBrowserOptionsUpdate = async (): Promise<void> => {
    setIsUpdatingOptions(true)
    try {
      const result = await window.api.updateBrowserOptions(projectPath, browserOptions)
      if (result.success) {
        toast.success(t('settings.browserOptions.updateSuccess'))
      } else {
        toast.error(result.error || t('settings.error.unexpected'))
      }
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')}: ${error}`)
    } finally {
      setIsUpdatingOptions(false)
    }
  }

  const handleStartAppium = async (): Promise<void> => {
    setIsStartingAppium(true)
    try {
      const result = await window.api.startAppium(projectPath)
      if (result.success) {
        toast.success(t('settings.appium.startSuccess'))
      } else {
        toast.error(result.error || t('settings.appium.startFailed'))
      }
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')}: ${error}`)
    } finally {
      setIsStartingAppium(false)
    }
  }

  const handlePathsUpdate = async (): Promise<void> => {
    setIsUpdatingPaths(true)
    try {
      const updates: { value: string; type?: 'feature' | 'spec' | 'helper' }[] = []
      if (pagePath.trim()) updates.push({ value: pagePath.trim() })
      if (featurePath.trim()) updates.push({ value: featurePath.trim(), type: 'feature' })
      if (specPath.trim()) updates.push({ value: specPath.trim(), type: 'spec' })
      if (helperPath.trim()) updates.push({ value: helperPath.trim(), type: 'helper' })

      for (const update of updates) {
        const result = await window.api.updatePaths(projectPath, update.value, update.type)
        if (!result.success) {
          toast.error(result.error || t('settings.error.unexpected'))
          setIsUpdatingPaths(false)
          return
        }
      }
      if (updates.length > 0) {
        toast.success(t('settings.paths.updateSuccess'))
      }
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')}: ${error}`)
    } finally {
      setIsUpdatingPaths(false)
    }
  }

  if (loading) {
    return <p>{t('settings.loading')}</p>
  }

  const sections = isMobileProject
    ? ['settings.section.appiumSettings']
    : ([] as string[])

  const newSections = isMobileProject
    ? ['settings.section.appium']
    : [
        'settings.section.timeout',
        'settings.section.debug',
        'settings.section.browserOptions'
      ]

  return (
    <div className="flex flex-col w-screen p-8 font-sans">
      <div className="relative w-full">
        <div className="relative h-[70vh] border border-neutral-bdr rounded-lg shadow-card overflow-y-auto bg-white p-4">
          <header className="flex flex-col items-center pt-8 mb-3">
            <h1 className="text-3xl font-bold mb-2">{t('settings.header.title')}</h1>
            <p className="text-xl mb-2 text-center">{t('settings.header.description')}</p>
          </header>
          <div className="border border-neutral-bdr rounded-lg overflow-hidden w-[60vw] mx-auto">
            {/* Existing sections */}
            {sections.map((section, index) => (
              <details key={index} className="border-b border-neutral-bdr p-4">
                <summary className="cursor-pointer font-semibold">{t(section)}</summary>
                <div className="pt-2">
                  {section === 'settings.section.appiumSettings' && (
                    <>
                      <label htmlFor="mobile-appium-url" className="font-medium mr-2">
                        {t('settings.mobile.appiumUrl.label')}
                      </label>
                      <input
                        type="text"
                        id="mobile-appium-url"
                        value={mobileAppiumUrl}
                        onChange={(e) => setMobileAppiumUrl(e.target.value)}
                        placeholder={t('settings.mobile.appiumUrl.placeholder')}
                        className="border p-1 rounded mt-2 w-full"
                      />
                      <label htmlFor="mobile-platform-version" className="font-medium mr-2 mt-4 block">
                        {t('settings.mobile.platformVersion.label')}
                      </label>
                      <input
                        type="text"
                        id="mobile-platform-version"
                        value={mobilePlatformVersion}
                        onChange={(e) => setMobilePlatformVersion(e.target.value)}
                        placeholder={t('settings.mobile.platformVersion.placeholder')}
                        className="border p-1 rounded mt-2 w-full"
                      />
                      <label htmlFor="mobile-automation-name" className="font-medium mr-2 mt-4 block">
                        {t('settings.mobile.automationName.label')}
                      </label>
                      <input
                        type="text"
                        id="mobile-automation-name"
                        value={mobileAutomationName}
                        onChange={(e) => setMobileAutomationName(e.target.value)}
                        placeholder={t('settings.mobile.automationName.placeholder')}
                        className="border p-1 rounded mt-2 w-full"
                      />
                      <label htmlFor="mobile-device-name" className="font-medium mr-2 mt-4 block">
                        {t('settings.mobile.deviceName.label')}
                      </label>
                      <input
                        type="text"
                        id="mobile-device-name"
                        value={mobileDeviceName}
                        onChange={(e) => setMobileDeviceName(e.target.value)}
                        placeholder={t('settings.mobile.deviceName.placeholder')}
                        className="border p-1 rounded mt-2 w-full"
                      />
                      <label htmlFor="mobile-app" className="font-medium mr-2 mt-4 block">
                        {t('settings.mobile.app.label')}
                      </label>
                      <input
                        type="text"
                        id="mobile-app"
                        value={mobileApp}
                        onChange={(e) => setMobileApp(e.target.value)}
                        placeholder={t('settings.mobile.app.placeholder')}
                        className="border p-1 rounded mt-2 w-full"
                      />
                      <div className="mt-4">
                        <Button
                          onClick={handleMobileSettingsUpdateClick}
                          type="primary"
                          disabled={isUpdatingMobile}
                        >
                          {t('settings.updateMobileSettingsButton')}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </details>
            ))}

            {/* New settings sections */}
            {newSections.map((section, index) => (
              <details key={`new-${index}`} className="border-b border-neutral-bdr p-4">
                <summary className="cursor-pointer font-semibold">{t(section)}</summary>
                <div className="pt-2">
                  {section === 'settings.section.timeout' && (
                    <>
                      <label htmlFor="timeout-input" className="font-medium mr-2">
                        {t('settings.timeout.label')}
                      </label>
                      <input
                        type="number"
                        id="timeout-input"
                        value={timeout}
                        onChange={(e) => setTimeout_(Number(e.target.value))}
                        min={1}
                        max={300}
                        className="border p-1 rounded mt-2 w-32"
                      />
                      <div className="mt-4">
                        <Button
                          onClick={handleTimeoutUpdate}
                          type="primary"
                          disabled={isUpdatingTimeout}
                        >
                          {t('settings.timeout.updateButton')}
                        </Button>
                      </div>
                    </>
                  )}

                  {section === 'settings.section.debug' && (
                    <div className="mt-2">
                      <ToggleSwitch
                        label={t('settings.debug.label')}
                        checked={debugMode}
                        onChange={handleDebugToggle}
                        disabled={isUpdatingDebug}
                        description={t('settings.debug.description')}
                      />
                    </div>
                  )}
                  {section === 'settings.section.browserOptions' && (
                    <>
                      <div className="mt-2">
                        <TagInput
                          tags={browserOptions}
                          onChange={setBrowserOptions}
                          placeholder={t('settings.browserOptions.placeholder')}
                        />
                      </div>
                      <div className="mt-4">
                        <Button
                          onClick={handleBrowserOptionsUpdate}
                          type="primary"
                          disabled={isUpdatingOptions}
                        >
                          {t('settings.browserOptions.updateButton')}
                        </Button>
                      </div>
                    </>
                  )}
                  {section === 'settings.section.appium' && (
                    <div className="mt-2">
                      <Button
                        onClick={handleStartAppium}
                        type="primary"
                        disabled={isStartingAppium}
                      >
                        {isStartingAppium
                          ? t('settings.appium.starting')
                          : t('settings.appium.startButton')}
                      </Button>
                    </div>
                  )}
                </div>
              </details>
            ))}

            {/* Paths section */}
            <details className="border-b border-neutral-bdr p-4">
              <summary className="cursor-pointer font-semibold">
                {t('settings.section.paths')}
              </summary>
              <div className="pt-2 space-y-3">
                <div>
                  <label className="font-medium block mb-1">{t('settings.paths.page')}</label>
                  <input
                    type="text"
                    value={pagePath}
                    onChange={(e) => setPagePath(e.target.value)}
                    placeholder="e.g. pages"
                    className="border p-1 rounded w-full"
                  />
                </div>
                <div>
                  <label className="font-medium block mb-1">{t('settings.paths.feature')}</label>
                  <input
                    type="text"
                    value={featurePath}
                    onChange={(e) => setFeaturePath(e.target.value)}
                    placeholder="e.g. features"
                    className="border p-1 rounded w-full"
                  />
                </div>
                <div>
                  <label className="font-medium block mb-1">{t('settings.paths.spec')}</label>
                  <input
                    type="text"
                    value={specPath}
                    onChange={(e) => setSpecPath(e.target.value)}
                    placeholder="e.g. spec"
                    className="border p-1 rounded w-full"
                  />
                </div>
                <div>
                  <label className="font-medium block mb-1">{t('settings.paths.helper')}</label>
                  <input
                    type="text"
                    value={helperPath}
                    onChange={(e) => setHelperPath(e.target.value)}
                    placeholder="e.g. helpers"
                    className="border p-1 rounded w-full"
                  />
                </div>
                <div className="mt-4">
                  <Button
                    onClick={handlePathsUpdate}
                    type="primary"
                    disabled={isUpdatingPaths}
                  >
                    {t('settings.paths.updateButton')}
                  </Button>
                </div>
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
