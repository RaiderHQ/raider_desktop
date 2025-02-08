import { Outlet, Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from '@assets/images/logo-with-title.svg'

const MainTemplate: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const raiderVersion = import.meta.env.VITE_RAIDER_VERSION

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center justify-between bg-white px-8 py-4 border-b-[1px] border-black">
        <div className="flex items-center space-x-4">
          <img src={Logo} alt="Logo" className="w-100 h-10" />
        </div>
        <nav className="flex space-x-8">
          <Link to="/project/overview" className="text-gray-600 hover:text-gray-800">
            {t('menu.tests')}
          </Link>
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
