import React, { useState, useEffect } from 'react'
import Button from '@components/Button'
import useProjectStore from '@foundation/Stores/projectStore'

const Settings: React.FC = () => {
  const projectPath: string = useProjectStore((state: { projectPath: string }) => state.projectPath)
  const [selectedBrowser, setSelectedBrowser] = useState('chrome')
  const [browserUrl, setBrowserUrl] = useState('https://automationteststore.com/')
  const [isUpdating, setIsUpdating] = useState(false) // Loader state

  useEffect(() => {
    const fetchUrl = async () => {
      try {
        const storedUrl = localStorage.getItem('browserUrl')
        if (storedUrl) {
          setBrowserUrl(storedUrl)
        }
      } catch (error) {
        console.error('Error fetching stored URL:', error)
      }
    }

    fetchUrl()
  }, [])

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBrowser(event.target.value)
  }

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setBrowserUrl(event.target.value)
  }

  const handleBrowserUpdateClick = () => {
    console.log(`Browser updated to: ${selectedBrowser}`)
  }

  const handleUrlUpdateClick = async () => {
    setIsUpdating(true) // Start the loader
    try {
      const response = await window.api.updateBrowserUrl(projectPath, browserUrl)
      setIsUpdating(false) // Stop the loader
      if (response.success) {
        console.log(`Browser URL updated to: ${browserUrl}`)
        localStorage.setItem('browserUrl', browserUrl) // Persist the updated URL
      } else {
        console.error('Error updating browser URL:', response.error)
        alert('Failed to update browser URL. Please try again.')
      }
    } catch (error) {
      setIsUpdating(false) // Stop the loader
      console.error('Unexpected error updating browser URL:', error)
      alert('An unexpected error occurred. Please try again.')
    }
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
                    <Button onClick={handleUrlUpdateClick} type="primary" disabled={isUpdating}>
                      {isUpdating ? 'Updating...' : 'Update URL'}
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
                    <Button onClick={handleBrowserUpdateClick} type="primary">
                      Update Browser
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
