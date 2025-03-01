import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import Logo from '@assets/images/logo.svg'
import { FaArrowLeft } from "react-icons/fa";
import { useNavigate } from "react-router-dom"

interface RubyError {
  code: string
  params: { [key: string]: string }
}

interface InstallGuideProps {
  rubyMissing: boolean
  rubyError?: RubyError | null
  allureMissing: boolean
}

const InstallGuide: React.FC<InstallGuideProps> = ({ rubyMissing, rubyError, allureMissing }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const handleNavigation = (url: string) => window.open(url, '_blank')

  let errorMessage = rubyError
    ? t(rubyError.code, rubyError.params)
    : (rubyMissing ? t('installGuide.rubyMissing') : '')

  if (allureMissing) {
    errorMessage += errorMessage ? ' ' : ''
    errorMessage += t('installGuide.allureMissing')
  }

  return (
    <div className="min-w-full items-center">
      <ContentArea>
        <button
          onClick={() => navigate('/')}
          className="absolute top-4 left-4"
          aria-label="Go Back"
        >
          <FaArrowLeft size={24} />
        </button>
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
