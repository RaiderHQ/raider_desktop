import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QuestionIcon from '@assets/icons/Question_vector.svg'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import SelectInput from '@components/SelectInput'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'

const options = {
  automation: ['Appium', 'Selenium', 'Axe'],
  test: ['Rspec', 'Cucumber'],
  mobile: ['Android', 'iOS']
}

const CreateProject: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const setLoading: (loading: boolean) => void = useLoadingStore(
    (state: { setLoading: (loading: boolean) => void }) => state.setLoading
  )
  const setProjectPath: (path: string) => void = useProjectStore(
    (state: { setProjectPath: (path: string) => void }) => state.setProjectPath
  )

  const [automationFramework, setAutomationFramework] = useState('Appium')
  const [testFramework, setTestFramework] = useState('Rspec')
  const [mobilePlatform, setMobilePlatform] = useState('Android')
  const showMobile = automationFramework === 'Appium'

  const handleCreateProject = async (): Promise<void> => {
    setLoading(true)

    const nameOfProject = 'NewProject' // You can change this to be dynamic if needed

    try {
      // const output = await (window as any).api.runRaiderCommand(
      //   nameOfProject,
      //   testFramework,
      //   automationFramework
      // )
      // console.log('Raider command output:', output)

      const folder = await window.api.selectFolder('Select a folder to save your project')
      if (!folder) {
        return
      }

      const data = {
        name: nameOfProject,
        rubyVersion: null,
        createdAt: new Date().toISOString(),
        framework: {
          automation: automationFramework,
          test: testFramework,
          mobile: mobilePlatform
        },
        settings: {
          baseUrl: null,
          browser: 'Chrome',
          browserSettings: []
        }
      }
      await window.api.createSettingsFile(folder, data)
      const { success } = await window.api.checkConfig(folder)
      if (!success) {
        // To-do: Inform user about the error with a modal
        return
      }

      setProjectPath(folder)
      navigate('/project/overview')
    } catch (error) {
      console.error('Error running raider command:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOptionChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string
  ): void => {
    setLoading(true)
    setter(value)
    setTimeout((): void => setLoading(false), 300)
  }

  return (
    <>
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold mb-2">{t('newProject.title')}</h1>
        <p className="text-gray-600">{t('newProject.subtitle')}</p>
      </div>

      <ContentArea>
        <div className="bg-white p-8">
          <div className="absolute top-2 right-2">
            <img src={QuestionIcon} className="w-4 h-auto" />
          </div>
          <div className={`grid ${showMobile ? 'grid-cols-2' : 'grid-cols-1'} gap-x-8 mb-6 w-full`}>
            <div className="flex flex-col space-y-6">
              <SelectInput
                label={t('newProject.question.automation')}
                options={options.automation}
                selected={automationFramework}
                onChange={({ target }: React.ChangeEvent<HTMLSelectElement>) =>
                  handleOptionChange(setAutomationFramework, target.value)
                }
              />
              <SelectInput
                label={t('newProject.question.test')}
                options={options.test}
                selected={testFramework}
                onChange={({ target }: React.ChangeEvent<HTMLSelectElement>) =>
                  handleOptionChange(setTestFramework, target.value)
                }
              />
            </div>
            {showMobile && (
              <div className="flex flex-col space-y-6">
                <SelectInput
                  label={t('newProject.question.mobile')}
                  options={options.mobile}
                  selected={mobilePlatform}
                  onChange={({ target }: React.ChangeEvent<HTMLSelectElement>) =>
                    handleOptionChange(setMobilePlatform, target.value)
                  }
                />
              </div>
            )}
          </div>

          <div className={`flex ${showMobile ? 'justify-end' : 'justify-between'} space-x-4`}>
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
