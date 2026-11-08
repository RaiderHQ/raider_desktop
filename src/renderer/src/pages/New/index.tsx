import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import InfoButton from '@components/InfoButton'
import InputField from '@components/InputField'
import SelectInput from '@components/SelectInput'
import Checkbox from '@components/Checkbox'
import LoadingScreen from '@components/LoadingScreen'
import Tooltip from '@components/Tooltip'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useVersionStore, { supportsRuntime } from '@foundation/Stores/versionStore'
import type { ProjectCreationOptions } from '@shared/types/projectCreationTypes'
import { isValidProjectName } from '@shared/projectName'
import { showErrorToast } from '@foundation/errorToast'

const CreateProject: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const loading = useLoadingStore((state) => state.loading)
  const setLoading = useLoadingStore((state) => state.setLoading)
  const setProjectPath = useProjectStore((state) => state.setProjectPath)
  const { rubyCommand } = useRubyStore()

  // Every project is generated on the 4.0 runtime: an older or missing gem cannot create one
  const gemVersion = useVersionStore((state) => state.version)
  const gemSupported = supportsRuntime(gemVersion)

  // The page tells users to update Ruby Raider and come back, so it reads the version again
  useEffect(() => {
    void useVersionStore.getState().loadVersion()
  }, [])

  const [projectName, setProjectName] = useState('')
  const [ciProvider, setCiProvider] = useState<'github' | 'azure'>('github')

  // Add-ons state
  const [accessibility, setAccessibility] = useState(false)
  const [examples, setExamples] = useState(true)

  const nameIsValid = isValidProjectName(projectName)
  // The rule shows under the field; it turns into an error once a wrong name is typed
  const nameError = projectName !== '' && !nameIsValid ? t('newProject.input.invalid') : undefined

  const handleCreateProject = async (): Promise<void> => {
    if (!nameIsValid || !gemSupported) return

    const folder = await window.api.selectFolder(t('newProject.alerts.selectFolder'))
    if (!folder) {
      return
    }

    setLoading(true)
    try {
      const overviewFolder = `${folder}/${projectName}`
      // Web projects only (Selenium + RSpec): mobile is not supported in this version
      const projectOptions: ProjectCreationOptions = { accessibility, ci: ciProvider, examples }

      const raiderResult = await window.api.runRubyRaider(
        folder,
        projectName,
        'selenium',
        rubyCommand || '',
        projectOptions
      )

      if (!raiderResult || !raiderResult.success) {
        showErrorToast(t('newProject.alerts.creationFailed'), raiderResult?.error)
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
      showErrorToast(t('newProject.alerts.creationFailed'), String(error))
    }
  }

  if (loading) {
    return <LoadingScreen shouldPersist={true} />
  }

  return (
    <>
      <div className="text-center mb-10 mt-10">
        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-neutral-dark mb-2">{t('newProject.title')}</h1>
        <p className="text-neutral-md text-base md:text-lg lg:text-xl">{t('newProject.subtitle')}</p>
      </div>

      <ContentArea>
        <InfoButton
          titleKey="help.createProject.title"
          messageKey="help.createProject.message"
          className="absolute top-2 right-4"
          docs={{ id: 'docs.projects', topic: t('docs.topics.projects') }}
        />

        <div className="bg-white p-4">
          <div className="mb-6">
            <InputField
              id="project-name"
              label={t('newProject.input.label')}
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder={t('newProject.input.placeholder')}
              hint={t('newProject.input.hint')}
              tooltip={t('tooltips.newProject.name')}
              error={nameError}
            />
          </div>

          <div className="flex flex-col space-y-6 mb-6 w-full">
            <div>
              <SelectInput
                label={t('newProject.ci.label')}
                options={[t('newProject.ci.github'), t('newProject.ci.azure')]}
                selected={
                  ciProvider === 'azure' ? t('newProject.ci.azure') : t('newProject.ci.github')
                }
                tooltip={t('tooltips.newProject.ci')}
                onChange={({ target }: React.ChangeEvent<HTMLSelectElement>) =>
                  setCiProvider(target.value === t('newProject.ci.azure') ? 'azure' : 'github')
                }
              />
            </div>
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
                tooltip={t('tooltips.newProject.accessibility')}
              />
              {gemSupported && (
                <Checkbox
                  label={t('newProject.addons.examples')}
                  checked={examples}
                  onChange={setExamples}
                  helpText={t('newProject.addons.examplesHelp')}
                  tooltip={t('tooltips.newProject.examples')}
                />
              )}
            </div>
          </div>

          <div className="flex">
            <div>
              <Tooltip content={t('tooltips.newProject.back')} position="top">
                <Button onClick={() => navigate(-1)} type="secondary">
                  {t('button.back.text')}
                </Button>
              </Tooltip>
            </div>
            <div className="pl-4">
              <Tooltip content={t('tooltips.newProject.create')} position="top">
                <Button
                  onClick={handleCreateProject}
                  type="primary"
                  disabled={!nameIsValid || !gemSupported}
                >
                  {t('button.create.text')}
                </Button>
              </Tooltip>
            </div>
          </div>
          {!gemSupported && (
            <p id="gem-needs-update" role="alert" className="mt-3 text-xs text-neutral-md">
              {t('newProject.gemNeedsUpdate')}
            </p>
          )}
        </div>
      </ContentArea>

    </>
  )
}

export default CreateProject
