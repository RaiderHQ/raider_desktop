import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QuestionIcon from '@assets/icons/Question_vector.svg'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import LoadingScreen from '@components/LoadingScreen'
import SelectInput from '@components/SelectInput'

const CreateProject: React.FC = () => {
  const navigate = useNavigate()

  // State for selected options
  const [automationFramework, setAutomationFramework] = useState('Appium')
  const [testFramework, setTestFramework] = useState('Rspec')
  const [mobilePlatform, setMobilePlatform] = useState('Android')

  // State for loading
  const [isLoading, setIsLoading] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false) // New loading state for transitions

  // Options for dropdowns
  const automationFrameworkOptions = ['Appium', 'Selenium', 'Axe']
  const testFrameworkOptions = ['Rspec', 'Cucumber']
  const mobilePlatformOptions = ['Android', 'iOS']

  // Check if the mobile platform selector is needed (Appium is selected)
  const showMobilePlatformSelector = automationFramework === 'Appium'

  // Function to handle project creation and show loading screen
  const handleCreateProject = async () => {
    setIsLoading(true) // Show loading screen

    // Construct the name of the project and other parameters
    const nameOfProject = 'NewProject' // You can change this to be dynamic if needed
    const framework = testFramework
    const automationType = automationFramework

    try {
      // Call the raider command API exposed in the preload script
      const output = await (window as any).api.runRaiderCommand(nameOfProject, framework, automationType)
      console.log('Raider command output:', output)

      // After successfully running the command, navigate to the overview page
      navigate('/project/overview') // Redirect to the Overview page
    } catch (error) {
      console.error('Error running raider command:', error)
    } finally {
      setIsLoading(false) // Hide loading screen
    }
  }

  // Function to handle dropdown change with a brief loading effect
  const handleOptionChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    setIsTransitioning(true) // Show transition loading screen
    setter(value) // Set the selected value

    // Hide the transition loader after a short delay (e.g., 300ms)
    setTimeout(() => {
      setIsTransitioning(false)
    }, 300)
  }
  return (
    <>
      {/* Loading screen for full-page loading and transitions */}
      <LoadingScreen isOpen={isLoading || isTransitioning} message="Updating options, please wait..." />

      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2">Create a new project</h1>
        <p className="text-gray-600">To create a project, first you need to select the following:</p>
      </div>

      <ContentArea>
        <div className="bg-white p-8">
          <div className="absolute top-2 right-2">
            <img src={QuestionIcon} className="w-4 h-auto" />
          </div>

          {/* Grid structure based on the number of visible selectors */}
          <div className={`grid ${showMobilePlatformSelector ? 'grid-cols-2' : 'grid-cols-1'} gap-x-8 mb-6 w-full`}>
            <div className="flex flex-col space-y-6">
              <SelectInput
                label="Select your automation framework"
                options={automationFrameworkOptions}
                selected={automationFramework}
                onChange={(event) => handleOptionChange(setAutomationFramework, event.target.value)}
              />
              <SelectInput
                label="Select your test framework"
                options={testFrameworkOptions}
                selected={testFramework}
                onChange={(event) => handleOptionChange(setTestFramework, event.target.value)}
              />
            </div>

            {/* Render mobile platform selector conditionally and below other selectors if Appium is selected */}
            {showMobilePlatformSelector && (
              <div className="flex flex-col space-y-6">
                <SelectInput
                  label="Select your mobile platform"
                  options={mobilePlatformOptions}
                  selected={mobilePlatform}
                  onChange={(event) => handleOptionChange(setMobilePlatform, event.target.value)}
                />
              </div>
            )}
          </div>

          {/* Adjust buttons layout */}
          <div className={`flex ${showMobilePlatformSelector ? 'justify-end' : 'justify-between'} space-x-4`}>
            <Button onClick={() => navigate(-1)} type="secondary">
              Back
            </Button>
            <Button onClick={handleCreateProject} type="primary">
              Create
            </Button>
          </div>
        </div>
      </ContentArea>
    </>
  )
}

export default CreateProject
