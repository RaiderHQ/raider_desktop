import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import QuestionIcon from '@assets/icons/Question_vector.svg'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import InformationModal from '@components/InformationModal'
import SelectInput from '@components/SelectInput'
import LoadingScreen from '@components/LoadingScreen'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'
import InstallGuide from '@pages/Info/InstallGuide'

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
  const [rubyMissing, setRubyMissing] = useState(false)
  const [rubyError, setRubyError] = useState<string | null>(null)

  const showMobile = automationFramework === 'Appium'

  const handleCreateProject = async (): Promise<void> => {
    if (!projectName.trim()) {
      toast.error(t('newProject.alerts.invalidName'))
      return
    }

    // First, select the folder
    const folder = await window.api.selectFolder(t('newProject.alerts.selectFolder'))
    if (!folder) {
      return
    }

    // Now that a folder is selected, show the loader.
    setLoading(true)
    try {
      // Check Ruby installation from the context of the selected folder.
      const rubyResult = await window.api.isRubyInstalled(folder)
      if (!rubyResult.success) {
        setRubyMissing(true)
        setRubyError(rubyResult.error ?? null)
        return
      }

      // Proceed to create the project if Ruby is valid.
      const overviewFolder = `${folder}/${projectName}`
      const automationParam = showMobile
        ? mobilePlatform.toLowerCase()
        : automationFramework.toLowerCase()

      const raiderResult = await window.api.runRubyRaider(
        folder,
        projectName,
        testFramework.toLowerCase(),
        automationParam
      )

      if (!raiderResult.success) {
        toast.error(`Error running Raider command: ${raiderResult.error}`)
        return
      }

      setProjectPath(overviewFolder)
      navigate('/project/overview')
    } catch (error) {
      toast.error(`Unexpected error while creating the project: ${error}`)
    } finally {
      // Add an extra second delay before hiding the loader.
      setTimeout(() => {
        setLoading(false)
      }, 1000)
    }
  }

  const handleOptionChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    value: string
  ): void => {
    setter(value)
  }

  // If Ruby check failed, show the installation guide.
  if (rubyMissing) {
    return <InstallGuide rubyMissing={rubyMissing} rubyError={rubyError} allureMissing={false} />
  }

  // If the global loading state is true, show the LoadingScreen.
  if (loading) {
    return <LoadingScreen shouldPersist={true} />
  }

  return (
    <>
      <div className="text-center mb-10">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-2">{t('newProject.title')}</h1>
        <p className="text-gray-600 text-base md:text-lg lg:text-xl">{t('newProject.subtitle')}</p>
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
            <input
              type="text"
              className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm md:text-base lg:text-lg"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t('newProject.input.placeholder')}
            />
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
