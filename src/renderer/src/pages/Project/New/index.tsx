import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import QuestionIcon from '@assets/icons/Question_vector.svg'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import SelectInput from '@components/SelectInput'

const CreateProject: React.FC = () => {
  const navigate = useNavigate()
  // State for selected options
  const [automationFramework, setAutomationFramework] = useState('Appium')
  const [testFramework, setTestFramework] = useState('Rspec')
  const [infrastructureProvider, setInfrastructureProvider] = useState('Browserstack')
  const [mobilePlatform, setMobilePlatform] = useState('Android')

  // Options for dropdowns
  const automationFrameworkOptions = ['Appium', 'Selenium', 'Cypress']
  const testFrameworkOptions = ['Rspec', 'Jest', 'Mocha']
  const infrastructureProviderOptions = ['Browserstack', 'Sauce Labs', 'Local']
  const mobilePlatformOptions = ['Android', 'iOS']

  return (
    <>
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2">Create a new project</h1>
        <p className="text-gray-600">To create a project, first you need to select following:</p>
      </div>
      <ContentArea>
        <div className="bg-white p-8">
          <div className="absolute top-2 right-2">
            <img src={QuestionIcon} className="w-4 h-auto" />
          </div>
          <div className="grid grid-cols-2 gap-x-8 mb-6 w-full">
            <div className="flex flex-col space-y-6">
              <SelectInput
                label="Select your automation framework"
                options={automationFrameworkOptions}
                selected={automationFramework}
                onChange={(event) => setAutomationFramework(event.target.value)}
              />
              <SelectInput
                label="Select your test framework"
                options={testFrameworkOptions}
                selected={testFramework}
                onChange={(event) => setTestFramework(event.target.value)}
              />
            </div>
            <div className="flex flex-col space-y-6">
              <SelectInput
                label="Select your infrastructure provider"
                options={infrastructureProviderOptions}
                selected={infrastructureProvider}
                onChange={(event) => setInfrastructureProvider(event.target.value)}
              />
              <SelectInput
                label="Select your mobile platform"
                options={mobilePlatformOptions}
                selected={mobilePlatform}
                onChange={(event) => setMobilePlatform(event.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-center space-x-4">
          <Button onClick={() => navigate(-1)} type="secondary">
            Back
          </Button>
          <Button onClick={() => console.log('Creating project')} type="primary">
            Create
          </Button>
        </div>
      </ContentArea>
    </>
  )
}

export default CreateProject
