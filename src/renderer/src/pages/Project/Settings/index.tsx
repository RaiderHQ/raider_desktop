import React, { useState } from 'react'
import Button from '@components/Button'

const Settings: React.FC = () => {
  const [selectedBrowser, setSelectedBrowser] = useState('chrome')
  const [browserUrl, setBrowserUrl] = useState('')
  const [browserSettings, setBrowserSettings] = useState({
    headless: false,
    incognito: false,
    disableExtensions: false
  })

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedBrowser(event.target.value)
  }

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setBrowserUrl(event.target.value)
  }

  const handleCheckboxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target
    setBrowserSettings((prevSettings) => ({
      ...prevSettings,
      [name]: checked
    }))
  }

  const handleBrowserUpdateClick = () => {
    console.log(`Browser updated to: ${selectedBrowser}`)
  }

  const handleUrlUpdateClick = () => {
    console.log(`Browser URL updated to: ${browserUrl}`)
  }

  const handleBrowserSettingsUpdateClick = () => {
    console.log('Browser settings updated to:', browserSettings)
  }

  return (
    <div className="p-3 font-sans">
      <header className="flex flex-col items-center mb-3">
        <h1 className="text-2xl font-bold mb-2">Configuration files</h1>
        <p className="mb-2 text-center">We added the following files to your project</p>
      </header>

      <div className="border border-gray-300 rounded-lg overflow-hidden w-[60vw]">
        {['Base Url', 'Browser', 'Browser Settings'].map((section, index) => (
          <details key={index} className="border-b border-gray-300 p-4">
            <summary className="cursor-pointer font-semibold">{section}</summary>
            <div className="pt-2">
              {section === 'Base Url' ? (
                <>
                  <label htmlFor="browser-url" className="font-medium mr-2">Browser URL:</label>
                  <input
                    type="text"
                    id="browser-url"
                    value={browserUrl}
                    onChange={handleUrlChange}
                    placeholder="Enter browser URL"
                    className="border p-1 rounded mt-2 w-full"
                  />
                  <div className="mt-4">
                    <Button onClick={handleUrlUpdateClick} type="primary">
                      Update URL
                    </Button>
                  </div>
                </>
              ) : section === 'Browser' ? (
                <>
                  <label htmlFor="browser-select" className="font-medium mr-2">Choose Browser:</label>
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
              ) : section === 'Browser Settings' ? (
                <>
                  <div className="flex flex-col mt-2">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        name="headless"
                        checked={browserSettings.headless}
                        onChange={handleCheckboxChange}
                        className="mr-2"
                      />
                      Headless
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        name="incognito"
                        checked={browserSettings.incognito}
                        onChange={handleCheckboxChange}
                        className="mr-2"
                      />
                      Incognito
                    </label>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        name="disableExtensions"
                        checked={browserSettings.disableExtensions}
                        onChange={handleCheckboxChange}
                        className="mr-2"
                      />
                      Disable Extensions
                    </label>
                  </div>
                  <div className="mt-4">
                    <Button onClick={handleBrowserSettingsUpdateClick} type="primary" className="p-4">
                      Update Settings
                    </Button>
                  </div>
                </>
              ) : (
                <div>Placeholder content for {section}.</div>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  )
}

export default Settings
