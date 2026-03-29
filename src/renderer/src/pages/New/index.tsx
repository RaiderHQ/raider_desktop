import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import InfoButton from '@components/InfoButton'
import InputField from '@components/InputField'
import SelectInput from '@components/SelectInput'
import Checkbox from '@components/Checkbox'
import LoadingScreen from '@components/LoadingScreen'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'

const options = {
  automation: ['Selenium', 'Watir'],
  test: ['Rspec', 'Cucumber']
}

const CreateProject: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const loading = useLoadingStore((state) => state.loading)
  const setLoading = useLoadingStore((state) => state.setLoading)
  const setProjectPath = useProjectStore((state) => state.setProjectPath)
  const { rubyCommand } = useRubyStore()

  const [automationFramework, setAutomationFramework] = useState('Selenium')
  const [testFramework, setTestFramework] = useState('Rspec')
  const [projectName, setProjectName] = useState('')

  // Add-ons state
  const [accessibility, setAccessibility] = useState(false)

  const handleCreateProject = async (): Promise<void> => {
    if (!projectName.trim()) {
      toast.error(t('newProject.alerts.invalidName'))
      return
    }

    const folder = await window.api.selectFolder(t('newProject.alerts.selectFolder'))
    if (!folder) {
      return
    }

    setLoading(true)
    try {
      const overviewFolder = `${folder}/${projectName}`
      const automationParam = automationFramework.toLowerCase()

      const raiderResult = await window.api.runRubyRaider(
        folder,
        projectName,
        testFramework.toLowerCase(),
        automationParam,
        rubyCommand || '',
        null,
        { accessibility }
      )

      if (!raiderResult || !raiderResult.success) {
        toast.error(`Project creation failed: ${raiderResult?.error}`)
        setLoading(false)
        return
      }

      setProjectPath(overviewFolder)
      navigate('/overview')

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
      <div className="text-center mb-10 mt-10">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-neutral-dark mb-2">{t('newProject.title')}</h1>
        <p className="text-neutral-mid text-base md:text-lg lg:text-xl">{t('newProject.subtitle')}</p>
      </div>

      <ContentArea>
        <InfoButton
          titleKey="help.createProject.title"
          messageKey="help.createProject.message"
          className="absolute top-2 right-4"
        />

        <div className="bg-white p-4">
          <div className="mb-6">
            <InputField
              label={t('newProject.input.label')}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t('newProject.input.placeholder')}
            />
          </div>

          <div className="flex flex-col space-y-6 mb-6 w-full">
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

          {/* Add-ons section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-neutral-dark mb-3 border-b border-neutral-bdr pb-1">
              {t('newProject.addons.title')}
            </h3>
            <div className="space-y-2">
              <Checkbox
                label={t('newProject.addons.accessibility')}
                checked={accessibility}
                onChange={setAccessibility}
                helpText={t('newProject.addons.accessibilityHelp')}
              />
            </div>
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

    </>
  )
}

export default CreateProject
