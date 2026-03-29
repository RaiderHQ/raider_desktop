import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import ProjectSelector from '@components/ProjectSelector'
import Logo from '@components/Logo'
import InformationModal from '@components/InformationModal'
import OpenFolder from '@assets/icons/open-folder.svg'
import AddIcon from '@assets/icons/add.svg'
import RecorderIcon from '@assets/icons/bxs_up-arrow_side.svg'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'

const Landing: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [helpOpen, setHelpOpen] = useState(false)

  const setLoading: (loading: boolean) => void = useLoadingStore(
    (state: { setLoading: (loading: boolean) => void }) => state.setLoading
  )
  const setProjectPath: (path: string) => void = useProjectStore(
    (state: { setProjectPath: (path: string) => void }) => state.setProjectPath
  )

  const handleOpenProject = async (): Promise<void> => {
    try {
      setLoading(true)
      const folder = await window.api.selectFolder(t('landing.error.selectFolder'))

      if (!folder) {
        toast(t('landing.error.noFolderSelected'), { icon: 'ℹ️' })
        return
      }

      setProjectPath(folder)
      navigate('/overview')
    } catch (error) {
      toast.error(t('landing.error.openProject'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex flex-col items-center justify-center flex-grow">
        {/* Clickable logo with speech bubble */}
        <div className="relative mb-8 flex flex-col items-center">
          <button
            onClick={() => setHelpOpen(true)}
            className="relative group focus:outline-none"
            aria-label="Learn how Ruby Raider works"
          >
            <Logo size={120} />
            {/* Pulse ring to draw attention */}
            <span className="absolute inset-0 rounded-full animate-ping opacity-20 bg-ruby pointer-events-none" />
          </button>

          {/* Speech bubble */}
          <div className="mt-3 relative bg-white border border-neutral-bdr rounded-lg px-3 py-1.5 shadow-sm text-xs text-neutral-dk font-medium whitespace-nowrap">
            {/* Bubble tail pointing up */}
            <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-neutral-bdr" />
            <span className="absolute -top-[7px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[7px] border-b-white" />
            Click me to learn how it works
          </div>
        </div>

        <h1 className="text-[2.5rem] font-bold text-neutral-dark mb-4">{t('landing.title')}</h1>

        <p className="text-center text-lg md:text-xl lg:text-2xl text-neutral-mid mb-8">
          {t('landing.subtitle')}
        </p>

        <div className="grid grid-cols-3 gap-8 mb-8">
          <ProjectSelector
            icon={RecorderIcon}
            description={t('button.recorder.description')}
            url="/recorder"
            buttonValue={t('button.recorder.text')}
            modalTitleKey="information.openRecorder.title"
            modalMessageKey="information.openRecorder.message"
          />
          <ProjectSelector
            icon={OpenFolder}
            description={t('button.create.description')}
            url="/new"
            buttonValue={t('button.create.text')}
            modalTitleKey="information.createProject.title"
            modalMessageKey="information.createProject.message"
          />
          <ProjectSelector
            icon={AddIcon}
            description={t('button.open.description')}
            buttonValue={t('button.open.text')}
            modalTitleKey="information.openProject.title"
            modalMessageKey="information.openProject.message"
            onClick={handleOpenProject}
          />
        </div>
      </main>

      {helpOpen && (
        <InformationModal
          title={t('help.landing.title')}
          message={t('help.landing.message')}
          onClose={() => setHelpOpen(false)}
        />
      )}
    </div>
  )
}

export default Landing
