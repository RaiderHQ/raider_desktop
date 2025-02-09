import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import useProjectStore from '@foundation/Stores/projectStore'

const Settings: React.FC = () => {
  const { t } = useTranslation()
  const projectPath: string = useProjectStore((state: { projectPath: string }) => state.projectPath)
  const [selectedBrowser, setSelectedBrowser] = useState('chrome')
  const [browserUrl, setBrowserUrl] = useState('https://automationteststore.com/')
  const [isUpdatingUrl, setIsUpdatingUrl] = useState(false)
  const [isUpdatingBrowser, setIsUpdatingBrowser] = useState(false)
  const [isMobileProject, setIsMobileProject] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const storedUrl = localStorage.getItem('browserUrl')
        const storedBrowser = localStorage.getItem('selectedBrowser')
        if (storedUrl) {
          setBrowserUrl(storedUrl)
        }
        if (storedBrowser) {
          setSelectedBrowser(storedBrowser)
        }

        const result = await window.api.isMobileProject(projectPath)
        if (result.success) {
          setIsMobileProject(result.isMobileProject || false)
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
      // Optionally use toast.success(...) for a success message
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
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')} : ${error}`)
    } finally {
      setIsUpdatingUrl(false)
    }
  }

  if (loading) {
    return <p>{t('settings.loading')}</p>
  }

  if (isMobileProject) {
    return (
      <div className="p-3 font-sans">
        <h1 className="text-2xl font-bold mb-2 text-center">{t('settings.mobileProject.title')}</h1>
        <p className="text-center">{t('settings.mobileProject.description')}</p>
      </div>
    )
  }

  return (
    <div className="p-3 font-sans">
      <header className="flex flex-col items-center mb-3">
        <h1 className="text-2xl font-bold mb-2">{t('settings.header.title')}</h1>
        <p className="mb-2 text-center">{t('settings.header.description')}</p>
      </header>

      <div className="border border-gray-300 rounded-lg overflow-hidden w-[60vw]">
        {['settings.section.baseUrl', 'settings.section.browser'].map((section, index) => (
          <details key={index} className="border-b border-gray-300 p-4">
            <summary className="cursor-pointer font-semibold">{t(section)}</summary>
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
                      {isUpdatingUrl ? t('settings.updating') : t('settings.updateUrlButton')}
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
                    <Button onClick={handleBrowserUpdateClick} type="primary" disabled={isUpdatingBrowser}>
                      {isUpdatingBrowser
                        ? t('settings.updating')
                        : t('settings.updateBrowserButton')}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

export default Settings
