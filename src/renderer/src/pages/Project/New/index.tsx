import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QuestionIcon from '@assets/icons/Question_vector.svg'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import SelectInput from '@components/SelectInput'
import useLoadingStore from '@foundation/Stores/loadingStore'

const CreateProject: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const setLoading = useLoadingStore((state) => state.setLoading)

  // State for selected options
  const [automationFramework, setAutomationFramework] = useState('Appium')
  const [testFramework, setTestFramework] = useState('Rspec')
  const [mobilePlatform, setMobilePlatform] = useState('Android')

  // Options for dropdowns
  const automationFrameworkOptions = ['Appium', 'Selenium', 'Axe']
  const testFrameworkOptions = ['Rspec', 'Cucumber']
  const mobilePlatformOptions = ['Android', 'iOS']

  // Check if the mobile platform selector is needed (Appium is selected)
  const showMobilePlatformSelector = automationFramework === 'Appium'

  // Function to handle project creation and show loading screen
  const handleCreateProject = async (): Promise<void> => {
    setLoading(true) // Show loading screen

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
      setLoading(false) // Hide loading screen
    }
  }

  // Function to handle dropdown change with a brief loading effect
  const handleOptionChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string
  ): void => {
    setLoading(true) // Show transition loading screen
    setter(value) // Set the selected value

    // Hide the transition loader after a short delay (e.g., 300ms)
    setTimeout(() => {
      setLoading(false)
    }, 300)
  }
  return (
    <>
      {/* Loading screen for full-page loading and transitions */}
      {/* <LoadingScreen
        isOpen={isLoading || isTransitioning}
        message="Updating options, please wait..."
      /> */}

      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2">{t('newProject.title')}</h1>
        <p className="text-gray-600">{t('newProject.subtitle')}</p>
      </div>

      <ContentArea>
        <div className="bg-white p-8">
          <div className="absolute top-2 right-2">
            <img src={QuestionIcon} className="w-4 h-auto" />
          </div>

          {/* Grid structure based on the number of visible selectors */}
          <div
            className={`grid ${showMobilePlatformSelector ? 'grid-cols-2' : 'grid-cols-1'} gap-x-8 mb-6 w-full`}
          >
            <div className="flex flex-col space-y-6">
              <SelectInput
                label={t('newProject.question.automation')}
                options={automationFrameworkOptions}
                selected={automationFramework}
                onChange={(event) => handleOptionChange(setAutomationFramework, event.target.value)}
              />
              <SelectInput
                label={t('newProject.question.test')}
                options={testFrameworkOptions}
                selected={testFramework}
                onChange={(event) => handleOptionChange(setTestFramework, event.target.value)}
              />
            </div>

            {/* Render mobile platform selector conditionally and below other selectors if Appium is selected */}
            {showMobilePlatformSelector && (
              <div className="flex flex-col space-y-6">
                <SelectInput
                  label={t('newProject.question.mobile')}
                  options={mobilePlatformOptions}
                  selected={mobilePlatform}
                  onChange={(event) => handleOptionChange(setMobilePlatform, event.target.value)}
                />
              </div>
            )}
          </div>

          {/* Adjust buttons layout */}
          <div
            className={`flex ${showMobilePlatformSelector ? 'justify-end' : 'justify-between'} space-x-4`}
          >
            <Button onClick={() => navigate(-1)} type="secondary">
              {t('button.back.text')}
            </Button>
            <Button onClick={handleCreateProject} type="primary">
              {t('button.create.text')}
            </Button>
          </div>
        </div>
      </ContentArea>
    </>
  )
}

export default CreateProject
