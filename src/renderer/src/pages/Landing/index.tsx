import React from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import ProjectSelector from '@components/ProjectSelector'
import Logo from '@assets/images/logo.svg'
import OpenFolder from '@assets/icons/open-folder.svg'
import AddIcon from '@assets/icons/add.svg'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'

const Landing: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()

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
        toast.error(t('landing.error.folderNotFound'))
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
        <div className="mb-8">
          <img src={Logo} alt="Ruby Raider Logo" className="w-28 md:w-36 lg:w-48 h-auto" />
        </div>

        <h1 className="text-[2.5rem] font-bold text-gray-900 mb-4">{t('landing.title')}</h1>

        <p className="text-center text-lg md:text-xl lg:text-2xl text-gray-600 mb-8">
          {t('landing.subtitle')}
        </p>

        <div className="flex space-x-8 mb-8">
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
    </div>
  )
}

export default Landing
