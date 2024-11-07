import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import QuestionIcon from '@assets/icons/Question_vector.svg'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import InformationModal from '@components/InformationModal'
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
  const setLoading = useLoadingStore((state) => state.setLoading)
  const setProjectPath = useProjectStore((state) => state.setProjectPath)

  const [automationFramework, setAutomationFramework] = useState('Appium')
  const [testFramework, setTestFramework] = useState('Rspec')
  const [mobilePlatform, setMobilePlatform] = useState('Android')
  const [isModalOpen, setModalOpen] = useState(false)

  const showMobile = automationFramework === 'Appium'

  const handleCreateProject = async () => {
    setLoading(true)
    try {
      const folder = await window.api.selectFolder('Select a folder to save your project')
      if (!folder) return

      const data = {
        name: 'NewProject',
        framework: {
          automation: automationFramework,
          test: testFramework,
          mobile: mobilePlatform
        },
        settings: { browser: 'Chrome', browserSettings: [] },
      }

      await window.api.createSettingsFile(folder, data)
      const { success } = await window.api.checkConfig(folder)
      if (success) {
        setProjectPath(folder)
        navigate('/project/overview')
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleOptionChange = (setter, value) => {
    setLoading(true)
    setter(value)
    setTimeout(() => setLoading(false), 300)
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
            <img
              src={QuestionIcon}
              className="w-4 h-auto cursor-pointer"
              onClick={() => setModalOpen(true)}
              alt="Help"
            />
          </div>
          <div className={`grid ${showMobile ? 'grid-cols-2' : 'grid-cols-1'} gap-x-8 mb-6 w-full`}>
            <div className="flex flex-col space-y-6">
              <SelectInput
                label={t('newProject.question.automation')}
                options={options.automation}
                selected={automationFramework}
                onChange={({ target }) =>
                  handleOptionChange(setAutomationFramework, target.value)
                }
              />
              <SelectInput
                label={t('newProject.question.test')}
                options={options.test}
                selected={testFramework}
                onChange={({ target }) => handleOptionChange(setTestFramework, target.value)}
              />
            </div>
            {showMobile && (
              <div className="flex flex-col space-y-6">
                <SelectInput
                  label={t('newProject.question.mobile')}
                  options={options.mobile}
                  selected={mobilePlatform}
                  onChange={({ target }) => handleOptionChange(setMobilePlatform, target.value)}
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

      {isModalOpen && (
        <InformationModal
          title={t('information.new.title')}
          message={t('information.new.message')}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}

export default CreateProject
