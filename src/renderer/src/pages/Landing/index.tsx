import { useTranslation } from 'react-i18next'
import ProjectSelector from '@components/ProjectSelector'
import Logo from '@assets/images/logo.svg'
import OpenFolder from '@assets/icons/open-folder.svg'
import AddIcon from '@assets/icons/add.svg'

const Landing: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const raiderVersion = import.meta.env.VITE_RAIDER_VERSION

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
          />
          <ProjectSelector
            icon={AddIcon}
            description={t('button.open.description')}
            url="/project/overview"
            buttonValue={t('button.open.text')}
          />
        </div>
        <footer className="text-gray-500">{t('version', { version: raiderVersion })}</footer>
      </div>
    </>
  )
}

export default Landing
