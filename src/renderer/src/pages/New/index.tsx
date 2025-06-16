import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import QuestionIcon from '@assets/icons/Question_vector.svg'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import InformationModal from '@components/InformationModal'
import InputField from '@components/InputField'
import SelectInput from '@components/SelectInput'
import LoadingScreen from '@components/LoadingScreen'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'

const options = {
  automation: ['Appium', 'Selenium', 'Watir'],
  test: ['Rspec', 'Cucumber'],
  mobile: ['Android', 'iOS']
}

const CreateProject: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const loading = useLoadingStore((state) => state.loading)
  const setLoading = useLoadingStore((state) => state.setLoading)
  const setProjectPath = useProjectStore((state) => state.setProjectPath)

  const [automationFramework, setAutomationFramework] = useState('Selenium')
  const [testFramework, setTestFramework] = useState('Rspec')
  const [mobilePlatform, setMobilePlatform] = useState('Android')
  const [isModalOpen, setModalOpen] = useState(false)
  const [projectName, setProjectName] = useState('')

  const showMobile = automationFramework === 'Appium'

  const handleCreateProject = async (): Promise<void> => {
    if (!projectName.trim()) {
      toast.error(t('newProject.alerts.invalidName'))
      return
    }

    const folder = await window.api.selectFolder(
      t('newProject.alerts.selectFolder')
    )
    if (!folder) {
      return
    }

    setLoading(true)
    try {
      const overviewFolder = `${folder}/${projectName}`
      const automationParam = showMobile
        ? mobilePlatform.toLowerCase()
        : automationFramework.toLowerCase()

      // Call the command without checking for success

      const raiderResult = await window.api.runRubyRaider(
        folder,
        projectName,
        testFramework.toLowerCase(),
        automationParam
      );

      // Add this block back for debugging
      console.log('Raider result from main process:', raiderResult);
      if (!raiderResult || !raiderResult.success) {
        toast.error(`Project creation failed: ${raiderResult?.error }`);
        setLoading(false);
        return;
      }

      setProjectPath(overviewFolder)
      navigate('/overview')

      // Keep the loader for a short period on success for better UX
      setTimeout(() => {
        setLoading(false)
      }, 1000)
    } catch (error) {
      setLoading(false)
      toast.error(`An unexpected error occurred: ${error}`)
    }
  }

  const handleOptionChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string
  ): void => {
    setter(value)
  }

  if (loading) {
    return <LoadingScreen shouldPersist={true} />
  }

  return (
    <>
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-2">
          {t('newProject.title')}
        </h1>
        <p className="text-gray-600 text-base md:text-lg lg:text-xl">
          {t('newProject.subtitle')}
        </p>
      </div>

      <ContentArea>
        <div className="absolute top-2 right-4">
          <img
            src={QuestionIcon}
            className="w-5 md:w-6 lg:w-8 h-auto cursor-pointer"
            onClick={() => setModalOpen(true)}
            alt="Help"
          />
        </div>

        <div className="bg-white p-4">
          <div className="mb-6">
            <label className="block mb-2 text-sm md:text-base lg:text-lg font-medium text-black-700">
              {t('newProject.input.label')}
            </label>
            <InputField
              label="Project Name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t('newProject.input.placeholder')}
            />
          </div>

          <div
            className={`grid ${
              showMobile ? 'grid-cols-2' : 'grid-cols-1'
            } gap-x-8 mb-6 w-full`}
          >
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

          <div className="flex">
            <div>
              <Button onClick={() => navigate(-1)} type="secondary">
                {t('button.back.text')}
              </Button>
            </div>
            <div className="pl-4">
              <Button onClick={handleCreateProject} type="primary">
                {t('button.create.text')}
              </Button>
            </div>
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
