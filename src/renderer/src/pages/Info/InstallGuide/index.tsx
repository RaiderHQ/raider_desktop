import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import Logo from '@assets/images/logo.svg'

const InstallGuide: React.FC = () => {
  const { t } = useTranslation()
  const handleNavigation = (url: string) => window.open(url, '_blank')

  return (
    <div className="min-h-screen flex items-center">
      <ContentArea>
        <div className="flex flex-col items-center">
          <div className="mb-2">
            <img src={Logo} alt="Ruby Raider Logo" className="w-28 h-auto" />
          </div>
          <div className="bg-white p-4 text-center">
            <h1 className="text-3xl font-bold mb-3 text-gray-900">{t('errorPage.title')}</h1>
            <div className="bg-gray-100 text-gray-700 p-3 mb-4 rounded-md">
              <p>
                {t('installGuide.message')}
                <br />
                {t('installGuide.information')}
              </p>
            </div>
            <div className="flex justify-between space-x-4">
              <Button
                onClick={() => handleNavigation('https://github.com/RaiderHQ/ruby_raider')}
                type="secondary"
              >
                {t('button.goTo.text', { location: 'GitHub' })}
              </Button>
              <Button onClick={() => handleNavigation('https://ruby-raider.com/')} type="primary">
                {t('button.goTo.text', { location: 'Website' })}
              </Button>
            </div>
          </div>
        </div>
      </ContentArea>
    </div>
  )
}

export default InstallGuide
