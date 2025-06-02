import { Outlet, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '@assets/images/logo-with-title.svg'
import useVersionStore from '@foundation/Stores/versionStore'
import { Toaster } from 'react-hot-toast'

const MainTemplate: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const location = useLocation()
  const raiderVersion = useVersionStore((state: { version: string }) => state.version)

  const isCreateProjectView = location.pathname === '/project/new'

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center justify-between bg-white px-8 py-4 border-b border-black">
        <div className="flex items-center space-x-4">
          <img src={Logo} alt="Logo" className="w-100 h-10" />
        </div>

        {!isCreateProjectView && (
          <nav className="flex space-x-8">
            <Link to="/project/overview" className="text-gray-600 hover:text-gray-800">
              {t('menu.tests')}
      </Link>
      <Link to="/project/recorder" className="text-gray-600 hover:text-gray-800">
        Recorder
            </Link>
            <Link to="/project/dashboard" className="text-gray-600 hover:text-gray-800">
              {t('menu.dashboard')}
            </Link>
            <Link to="/project/settings" className="text-gray-600 hover:text-gray-800">
              {t('menu.settings')}
            </Link>
          </nav>
        )}
      </header>

      <main className="flex flex-col items-center justify-center flex-grow">
        <Outlet />
      </main>

      <footer className="flex justify-center py-4 bg-white">
        <p className="text-gray-500">{t('version', { version: raiderVersion })}</p>
      </footer>

      <Toaster />
    </div>
  )
}

export default MainTemplate
