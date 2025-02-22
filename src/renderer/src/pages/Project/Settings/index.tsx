import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import useProjectStore from '@foundation/Stores/projectStore'

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const projectPath: string = useProjectStore((state) => state.projectPath) || ''
  const [selectedBrowser, setSelectedBrowser] = useState('chrome')
  const [browserUrl, setBrowserUrl] = useState('https://automationteststore.com/')
  const [isUpdatingUrl, setIsUpdatingUrl] = useState(false)
  const [isUpdatingBrowser, setIsUpdatingBrowser] = useState(false)
  const [mobileAppiumUrl, setMobileAppiumUrl] = useState('')
  const [mobilePlatformVersion, setMobilePlatformVersion] = useState('')
  const [mobileAutomationName, setMobileAutomationName] = useState('')
  const [mobileDeviceName, setMobileDeviceName] = useState('')
  const [mobileApp, setMobileApp] = useState('')
  const [isUpdatingMobile, setIsUpdatingMobile] = useState(false)

  const [isMobileProject, setIsMobileProject] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSettings = async () => {
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
                const appiumOptions = capResponse.capabilities['appium:options'] || {}
                if (!storedMobileAppiumUrl) setMobileAppiumUrl(appiumOptions.url || '')
                if (!storedPlatformVersion) setMobilePlatformVersion(appiumOptions.platformVersion || '')
                if (!storedAutomationName) setMobileAutomationName(appiumOptions.automationName || '')
                if (!storedDeviceName) setMobileDeviceName(appiumOptions.deviceName || '')
                if (!storedMobileApp) setMobileApp(appiumOptions.app || '')
              }
            }
          } else {
            const storedUrl = localStorage.getItem('browserUrl')
            const storedBrowser = localStorage.getItem('selectedBrowser')
            if (storedUrl) {
              setBrowserUrl(storedUrl)
            }
            if (storedBrowser) {
              setSelectedBrowser(storedBrowser)
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

    fetchSettings()
  }, [projectPath, t])

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBrowser(event.target.value)
  }

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setBrowserUrl(event.target.value)
  }

  const handleBrowserUpdateClick = async () => {
    setIsUpdatingBrowser(true)
    try {
      const response = await window.api.updateBrowserType(projectPath, selectedBrowser)
      if (!response.success) {
        toast.error(t('settings.error.browserUpdateFailed'))
        return
      }
      localStorage.setItem('selectedBrowser', selectedBrowser)
      toast.success(t('settings.browserUpdateSuccess'))
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')} : ${error}`)
    } finally {
      setIsUpdatingBrowser(false)
    }
  }

  const handleUrlUpdateClick = async () => {
    setIsUpdatingUrl(true)
    try {
      const response = await window.api.updateBrowserUrl(projectPath, browserUrl)
      if (!response.success) {
        toast.error(t('settings.error.urlUpdateFailed'))
        return
      }
      localStorage.setItem('browserUrl', browserUrl)
      toast.success(t('settings.urlUpdateSuccess'))
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')} : ${error}`)
    } finally {
      setIsUpdatingUrl(false)
    }
  }

  const handleMobileSettingsUpdateClick = async () => {
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
      // Save values in localStorage
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

  if (loading) {
    return <p>{t('settings.loading')}</p>
  }

  if (isMobileProject) {
    return (
      <div className="flex flex-col w-screen p-8 font-sans">
        <div className="relative w-full">
          <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
          <div className="relative h-[70vh] border rounded-lg shadow-sm overflow-y-auto bg-white z-10 p-4">
            <header className="flex flex-col items-center pt-8 mb-3">
              <h1 className="text-3xl font-bold mb-2">{t('settings.mobileProject.title')}</h1>
              <p className="text-xl mb-2 text-center">{t('settings.mobileProject.description')}</p>
            </header>
            <div className="border border-gray-300 rounded-lg overflow-hidden w-[60vw] mx-auto">
              {/* Single expandable section for all mobile settings */}
              <details className="border-b border-gray-300 p-4">
                <summary className="cursor-pointer font-semibold">
                  {t('settings.section.appiumSettings')}
                </summary>
                <div className="pt-2">
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
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col w-screen p-8 font-sans">
      <div className="relative w-full">
        <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
        <div className="relative h-[70vh] border rounded-lg shadow-sm overflow-y-auto bg-white z-10 p-4">
          <header className="flex flex-col items-center pt-8 mb-3">
            <h1 className="text-3xl font-bold mb-2">{t('settings.header.title')}</h1>
            <p className="text-xl mb-2 text-center">{t('settings.header.description')}</p>
          </header>
          <div className="border border-gray-300 rounded-lg overflow-hidden w-[60vw] mx-auto">
            {['settings.section.baseUrl', 'settings.section.browser'].map((section, index) => (
              <details key={index} className="border-b border-gray-300 p-4">
                <summary className="cursor-pointer font-semibold">
                  {t(section)}
                </summary>
                <div className="pt-2">
                  {section === 'settings.section.baseUrl' ? (
                    <>
                      <label htmlFor="browser-url" className="font-medium mr-2">
                        {t('settings.baseUrl.label')}
                      </label>
                      <input
                        type="text"
                        id="browser-url"
                        value={browserUrl}
                        onChange={handleUrlChange}
                        placeholder={t('settings.baseUrl.placeholder')}
                        className="border p-1 rounded mt-2 w-full"
                      />
                      <div className="mt-4">
                        <Button onClick={handleUrlUpdateClick} type="primary" disabled={isUpdatingUrl}>
                          {t('settings.updateUrlButton')}
                        </Button>
                      </div>
                    </>
                  ) : section === 'settings.section.browser' ? (
                    <>
                      <label htmlFor="browser-select" className="font-medium mr-2">
                        {t('settings.browser.label')}
                      </label>
                      <select
                        id="browser-select"
                        value={selectedBrowser}
                        onChange={handleSelectChange}
                        className="border p-1 rounded mt-2"
                      >
                        <option value="chrome">{t('settings.browser.chrome')}</option>
                        <option value="safari">{t('settings.browser.safari')}</option>
                        <option value="firefox">{t('settings.browser.firefox')}</option>
                        <option value="edge">{t('settings.browser.edge')}</option>
                      </select>
                      <div className="my-4">
                        <Button
                          onClick={handleBrowserUpdateClick}
                          type="primary"
                          disabled={isUpdatingBrowser}
                        >
                          {t('settings.updateBrowserButton')}
                        </Button>
                      </div>
                    </>
                  ) : null}
                </div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings
