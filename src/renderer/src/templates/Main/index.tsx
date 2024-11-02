import { Outlet, Link } from 'react-router-dom'
import Logo from '@assets/images/logo-with-title.svg'

const MainTemplate: React.FC = (): JSX.Element => {
  const raiderVersion = import.meta.env.VITE_RAIDER_VERSION

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center justify-between bg-white px-8 py-4 border-b-[1px] border-black">
        <div className="flex items-center space-x-4">
          <img
            src={Logo} // Replace with your logo URL
            alt="Logo"
            className="w-100 h-10"
          />
        </div>
        <nav className="flex space-x-8">
          <Link to="/project/overview" className="text-gray-600 hover:text-gray-800">
            Tests
          </Link>
          <Link to="/project/settings" className="text-gray-600 hover:text-gray-800">
            Settings
          </Link>
        </nav>
      </header>

      <main className="flex flex-col items-center justify-center flex-grow">
        <Outlet />
      </main>

      <footer className="flex justify-center py-4 bg-white">
        <p className="text-gray-500">Ruby Raider Version: {raiderVersion}</p>
      </footer>
    </div>
  );
};

export default MainTemplate
