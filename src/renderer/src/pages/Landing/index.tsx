import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import ProjectSelector from '@components/ProjectSelector'
import Logo from '@assets/images/logo.svg'
import OpenFolder from '@assets/icons/open-folder.svg'
import AddIcon from '@assets/icons/add.svg'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { FileNode } from '@foundation/Types/fileNode'

const Landing: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const setLoading: (loading: boolean) => void = useLoadingStore(
    (state: { setLoading: (loading: boolean) => void }) => state.setLoading
  )
  const setProjectPath: (path: string) => void = useProjectStore(
    (state: { setProjectPath: (path: string) => void }) => state.setProjectPath
  )

  const raiderVersion = import.meta.env.VITE_RAIDER_VERSION

  const handleOpenProject = async () => {
    try {
      setLoading(true)

      const folder = await window.api.selectFolder('Select a project folder')
      if (!folder) {
        console.log('No folder selected')
        return
      }

      setProjectPath(folder)
      navigate('/project/overview')
    } catch (error) {
      console.error('Error opening project:', error)
      alert('An error occurred while opening the project. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="mb-8">
          <img src={Logo} alt="Ruby Raider Logo" className="w-28 h-auto" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">{t('landing.title')}</h1>
        <p className="text-center text-lg text-gray-600 mb-8">{t('landing.subtitle')}</p>

        <div className="flex space-x-8 mb-8">
          <ProjectSelector
            icon={OpenFolder}
            description={t('button.create.description')}
            url="/project/new"
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
        <footer className="text-gray-500">{t('version', { version: raiderVersion })}</footer>
      </div>
    </>
  )
}

export default Landing
