import React from 'react'
import { useTranslation } from 'react-i18next'
import DocsLink from '@components/DocsLink'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import Logo from '@assets/images/logo.svg'
import Tooltip from '@components/Tooltip'
import { FaArrowLeft } from 'react-icons/fa'
import { useNavigate } from 'react-router'

interface RubyError {
  code: string
  params: { [key: string]: string }
}

interface InstallGuideProps {
  rubyMissing: boolean
  rubyError?: RubyError | string | null
}

const InstallGuide: React.FC<InstallGuideProps> = ({ rubyMissing, rubyError }): JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()

  let errorMessage = ''

  if (rubyError) {
    if (typeof rubyError === 'string') {
      errorMessage = rubyError
    } else {
      errorMessage = t(rubyError.code, rubyError.params)
    }
  } else if (rubyMissing) {
    errorMessage = t('installGuide.rubyMissing')
  }

  return (
    <div className="min-w-full items-center">
      <ContentArea>
        <Tooltip
          content={t('tooltips.installGuide.back')}
          position="right"
          className="absolute top-4 left-4"
        >
          <button onClick={() => navigate('/')} aria-label={t('common.back')}>
            <FaArrowLeft size={24} />
          </button>
        </Tooltip>
        <div className="flex flex-col items-center">
          <div className="mb-2">
            <img src={Logo} alt={t('installGuide.logoAlt')} className="w-28 h-auto" />
          </div>
          <div className="bg-white p-4 text-center">
            <h1 className="text-3xl font-bold mb-3 text-neutral-dark">{t('installGuide.title')}</h1>
            <div className="bg-neutral-lt text-neutral-dk p-3 mb-4 rounded-md">
              <p>{errorMessage}</p>
            </div>
            <div className="flex justify-between space-x-4">
              <Tooltip content={t('tooltips.installGuide.github')} position="top">
                <Button
                  onClick={() => void window.api.openDocs('docs.gem')}
                  type="secondary"
                >
                  {t('installGuide.githubButton')}
                </Button>
              </Tooltip>
              <Tooltip content={t('tooltips.installGuide.website')} position="top">
                <Button onClick={() => void window.api.openDocs('docs.site')} type="primary">
                  {t('installGuide.websiteButton')}
                </Button>
              </Tooltip>
            </div>
            <div className="mt-3">
              <DocsLink id="docs.install" topic={t('docs.topics.install')} />
            </div>
          </div>
        </div>
      </ContentArea>
    </div>
  )
}

export default InstallGuide
