import React, { useState } from 'react'
import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import InfoButton from '@components/InfoButton'
import InputField from '@components/InputField'
import SelectInput from '@components/SelectInput'
import Checkbox from '@components/Checkbox'
import SegmentedControl from '@components/SegmentedControl'
import LoadingScreen from '@components/LoadingScreen'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useVersionStore, { isVersionAtLeast } from '@foundation/Stores/versionStore'
import type { ProjectCreationOptions } from '@shared/types/projectCreationTypes'

const options = {
  test: ['Rspec', 'Cucumber']
}

type Target = 'web' | 'mobile'
type Phones = 'ios' | 'android' | 'cross_platform'

// Mobile projects and the examples option arrive together in this gem version.
const MOBILE_MIN_VERSION = '3.12.0'

const CreateProject: React.FC = () => {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const loading = useLoadingStore((state) => state.loading)
  const setLoading = useLoadingStore((state) => state.setLoading)
  const setProjectPath = useProjectStore((state) => state.setProjectPath)
  const { rubyCommand } = useRubyStore()

  const gemVersion = useVersionStore((state) => state.version)
  const mobileSupported = isVersionAtLeast(gemVersion, MOBILE_MIN_VERSION)

  const [target, setTarget] = useState<Target>('web')
  const [phones, setPhones] = useState<Phones>('ios')
  const [testFramework, setTestFramework] = useState('Rspec')
  const [projectName, setProjectName] = useState('')
  const [ciProvider, setCiProvider] = useState<'github' | 'azure'>('github')

  // Add-ons state
  const [accessibility, setAccessibility] = useState(false)
  const [examples, setExamples] = useState(true)

  const isMobile = target === 'mobile' && mobileSupported

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
      // Web-only choices are kept in state but not sent for mobile projects.
      const projectOptions: ProjectCreationOptions = isMobile
        ? { accessibility: false, ci: 'github' }
        : { accessibility, ci: ciProvider }
      if (mobileSupported) projectOptions.examples = examples

      const raiderResult = await window.api.runRubyRaider(
        folder,
        projectName,
        testFramework.toLowerCase(),
        'selenium',
        rubyCommand || '',
        isMobile ? phones : null,
        projectOptions
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
            <div>
              <SegmentedControl<Target>
                label={t('newProject.question.target')}
                testId="target-control"
                value={target}
                onChange={setTarget}
                options={[
                  { value: 'web', label: t('newProject.target.web') },
                  {
                    value: 'mobile',
                    label: t('newProject.target.mobile'),
                    disabled: !mobileSupported,
                    describedBy: mobileSupported ? undefined : 'mobile-needs-update'
                  }
                ]}
              />
              {!mobileSupported && (
                <p id="mobile-needs-update" className="mt-1 text-xs text-neutral-mid">
                  {t('newProject.target.mobileNeedsUpdate')}
                </p>
              )}
            </div>
            {isMobile && (
              <SegmentedControl<Phones>
                label={t('newProject.question.phones')}
                testId="phones-control"
                value={phones}
                onChange={setPhones}
                options={[
                  { value: 'ios', label: t('newProject.phones.ios') },
                  { value: 'android', label: t('newProject.phones.android') },
                  { value: 'cross_platform', label: t('newProject.phones.both') }
                ]}
              />
            )}
            <SelectInput
              label={t('newProject.question.test')}
              options={options.test}
              selected={testFramework}
              onChange={({ target }: React.ChangeEvent<HTMLSelectElement>) =>
                handleOptionChange(setTestFramework, target.value)
              }
            />
            <div>
              <SelectInput
                label={t('newProject.ci.label')}
                options={
                  isMobile
                    ? [t('newProject.ci.github')]
                    : [t('newProject.ci.github'), t('newProject.ci.azure')]
                }
                selected={
                  ciProvider === 'azure' && !isMobile
                    ? t('newProject.ci.azure')
                    : t('newProject.ci.github')
                }
                onChange={({ target }: React.ChangeEvent<HTMLSelectElement>) =>
                  setCiProvider(target.value === t('newProject.ci.azure') ? 'azure' : 'github')
                }
              />
              {isMobile && (
                <p className="mt-1 text-xs text-neutral-mid">{t('newProject.ci.mobileAzure')}</p>
              )}
            </div>
          </div>

          {/* Add-ons section */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-neutral-dark mb-3 border-b border-neutral-bdr pb-1">
              {t('newProject.addons.title')}
            </h3>
            <div className="space-y-2">
              {!isMobile && (
                <Checkbox
                  label={t('newProject.addons.accessibility')}
                  checked={accessibility}
                  onChange={setAccessibility}
                  helpText={t('newProject.addons.accessibilityHelp')}
                />
              )}
              {mobileSupported && (
                <Checkbox
                  label={t('newProject.addons.examples')}
                  checked={examples}
                  onChange={setExamples}
                  helpText={t('newProject.addons.examplesHelp')}
                />
              )}
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
