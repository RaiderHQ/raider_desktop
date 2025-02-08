import { Outlet, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '@assets/images/logo-with-title.svg'
import useProjectStore from '@foundation/Stores/projectStore'

const MainTemplate: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const raiderVersion = import.meta.env.VITE_RAIDER_VERSION
  const projectPath = useProjectStore((state: { projectPath: string }) => state.projectPath)

  const handleOpenAllure = async (): Promise<void> => {
    try {
      const result = await window.api.openAllure(projectPath)
      if (result.success) {
        console.log('Dashboard opened:', result.output)
      } else {
        console.error(t('overview.error.openAllure'), result.error)
        alert(t('overview.error.openAllure'))
      }
    } catch (error) {
      console.error(t('overview.error.unexpectedOpenAllure'), error)
      alert(t('overview.error.unexpectedOpenAllure'))
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center justify-between bg-white px-8 py-4 border-b border-black">
        <div className="flex items-center space-x-4">
          <img src={Logo} alt="Logo" className="w-100 h-10" />
        </div>
        <nav className="flex space-x-8">
          <Link to="/project/overview" className="text-gray-600 hover:text-gray-800">
            {t('menu.tests')}
          </Link>
          {/* Dashboard link now triggers handleOpenAllure */}
          <button
            onClick={handleOpenAllure}
            className="text-gray-600 hover:text-gray-800 focus:outline-none"
          >
            {t('menu.dashboard')}
          </button>
          <Link to="/project/settings" className="text-gray-600 hover:text-gray-800">
            {t('menu.settings')}
          </Link>
        </nav>
      </header>

      <main className="flex flex-col items-center justify-center flex-grow">
        <Outlet />
      </main>

      <footer className="flex justify-center py-4 bg-white">
        <p className="text-gray-500">{t('version', { version: raiderVersion })}</p>
      </footer>
    </div>
  )
}

export default MainTemplate
