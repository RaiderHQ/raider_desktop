import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import Logo from '@assets/images/logo.svg'

interface InstallGuideProps {
  rubyMissing: boolean
  rubyVersion: string | null
  allureMissing: boolean
}

const InstallGuide: React.FC<InstallGuideProps> = ({ rubyMissing, rubyVersion, allureMissing }) => {
  const { t } = useTranslation()
  const handleNavigation = (url: string) => window.open(url, '_blank')

  let errorMessage = ''

  if (rubyMissing) {
    errorMessage = t('installGuide.rubyMissing')
  } else if (rubyVersion && rubyVersion < '3.0.0') {
    errorMessage = t('installGuide.rubyOutdated', { version: rubyVersion })
  }

  if (allureMissing) {
    errorMessage += errorMessage ? ' ' : ''
    errorMessage += t('installGuide.allureMissing')
  }

  return (
    <div className="min-h-screen flex items-center">
      <ContentArea>
        <div className="flex flex-col items-center">
          <div className="mb-2">
            <img src={Logo} alt={t('installGuide.logoAlt')} className="w-28 h-auto" />
          </div>
          <div className="bg-white p-4 text-center">
            <h1 className="text-3xl font-bold mb-3 text-gray-900">{t('installGuide.title')}</h1>
            <div className="bg-gray-100 text-gray-700 p-3 mb-4 rounded-md">
              <p>{errorMessage}</p>
            </div>
            <div className="flex justify-between space-x-4">
              <Button onClick={() => handleNavigation('https://github.com/RaiderHQ/ruby_raider')} type="secondary">
                {t('installGuide.githubButton')}
              </Button>
              <Button onClick={() => handleNavigation('https://ruby-raider.com/')} type="primary">
                {t('installGuide.websiteButton')}
              </Button>
            </div>
          </div>
        </div>
      </ContentArea>
    </div>
  )
}

export default InstallGuide
