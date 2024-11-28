import React, { useState, useEffect } from 'react'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Button from '@components/Button'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import useProjectStore from '@foundation/Stores/projectStore'

const Settings: React.FC = () => {
  const projectPath: string = useProjectStore((state: { projectPath: string }) => state.projectPath)
  const [selectedBrowser, setSelectedBrowser] = useState('chrome')
  const [browserUrl, setBrowserUrl] = useState('https://automationteststore.com/')
  const [isUpdatingUrl, setIsUpdatingUrl] = useState(false) // Loader state for URL
  const [isUpdatingBrowser, setIsUpdatingBrowser] = useState(false) // Loader state for Browser
  const [isMobileProject, setIsMobileProject] = useState(false) // Check if it's a mobile project
  const [loading, setLoading] = useState(true) // Loading state for determining mobile project

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

        // Check if the project is a mobile project
        const result = await window.api.isMobileProject(projectPath)
        if (result.success) {
          setIsMobileProject(result.isMobileProject || false)
        } else {
          console.error('Error checking if project is mobile:', result.error)
        }
      } catch (error) {
        console.error('Error fetching settings or checking mobile project:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [projectPath])

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBrowser(event.target.value)
  }

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setBrowserUrl(event.target.value)
  }

  const handleBrowserUpdateClick = async () => {
    setIsUpdatingBrowser(true) // Start the loader for Browser
    try {
      const response = await window.api.updateBrowserType(projectPath, selectedBrowser)
      setIsUpdatingBrowser(false) // Stop the loader for Browser
      if (response.success) {
        localStorage.setItem('selectedBrowser', selectedBrowser) // Persist the selected browser
        console.log(`Browser updated to: ${selectedBrowser}`)
      } else {
        console.error('Error updating browser:', response.error)
        alert('Failed to update browser. Please try again.')
      }
    } catch (error) {
      setIsUpdatingBrowser(false) // Stop the loader for Browser
      console.error('Unexpected error updating browser:', error)
      alert('An unexpected error occurred. Please try again.')
    }
  }

  const handleUrlUpdateClick = async () => {
    setIsUpdatingUrl(true) // Start the loader for URL
    try {
      const response = await window.api.updateBrowserUrl(projectPath, browserUrl)
      setIsUpdatingUrl(false) // Stop the loader for URL
      if (response.success) {
        localStorage.setItem('browserUrl', browserUrl) // Persist the updated URL
        console.log(`Browser URL updated to: ${browserUrl}`)
      } else {
        console.error('Error updating browser URL:', response.error)
        alert('Failed to update browser URL. Please try again.')
      }
    } catch (error) {
      setIsUpdatingUrl(false) // Stop the loader for URL
      console.error('Unexpected error updating browser URL:', error)
      alert('An unexpected error occurred. Please try again.')
    }
  }

  if (loading) {
    return <p>Loading settings...</p>
  }

  if (isMobileProject) {
    return (
      <div className="p-3 font-sans">
        <h1 className="text-2xl font-bold mb-2 text-center">Mobile Project</h1>
        <p className="text-center">
          For now, mobile settings are not supported. They will come in newer versions of the app.
        </p>
      </div>
    )
  }

  return (
    <div className="p-3 font-sans">
      <header className="flex flex-col items-center mb-3">
        <h1 className="text-2xl font-bold mb-2">Configuration files</h1>
        <p className="mb-2 text-center">We added the following files to your project</p>
      </header>

      <div className="border border-gray-300 rounded-lg overflow-hidden w-[60vw]">
        {['Base Url', 'Browser'].map((section, index) => (
          <details key={index} className="border-b border-gray-300 p-4">
            <summary className="cursor-pointer font-semibold">{section}</summary>
            <div className="pt-2">
              {section === 'Base Url' ? (
                <>
                  <label htmlFor="browser-url" className="font-medium mr-2">
                    Browser URL:
                  </label>
                  <input
                    type="text"
                    id="browser-url"
                    value={browserUrl}
                    onChange={handleUrlChange}
                    placeholder="Enter browser URL"
                    className="border p-1 rounded mt-2 w-full"
                  />
                  <div className="mt-4">
                    <Button onClick={handleUrlUpdateClick} type="primary" disabled={isUpdatingUrl}>
                      {isUpdatingUrl ? 'Updating...' : 'Update URL'}
                    </Button>
                  </div>
                </>
              ) : section === 'Browser' ? (
                <>
                  <label htmlFor="browser-select" className="font-medium mr-2">
                    Choose Browser:
                  </label>
                  <select
                    id="browser-select"
                    value={selectedBrowser}
                    onChange={handleSelectChange}
                    className="border p-1 rounded mt-2"
                  >
                    <option value="chrome">Chrome</option>
                    <option value="safari">Safari</option>
                    <option value="firefox">Firefox</option>
                    <option value="edge">Edge</option>
                  </select>

                  <div className="my-4">
                    <Button onClick={handleBrowserUpdateClick} type="primary" disabled={isUpdatingBrowser}>
                      {isUpdatingBrowser ? 'Updating...' : 'Update Browser'}
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
