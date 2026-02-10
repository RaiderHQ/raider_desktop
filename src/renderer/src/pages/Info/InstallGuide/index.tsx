import React from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import Logo from '@assets/images/logo.svg'
import { FaArrowLeft } from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'

interface RubyError {
  code: string
  params: { [key: string]: string }
}

interface InstallGuideProps {
  rubyMissing: boolean
  rubyError?: RubyError | string | null
  allureMissing: boolean
}

const InstallGuide: React.FC<InstallGuideProps> = ({
  rubyMissing,
  rubyError,
  allureMissing
}): JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const handleNavigation = (url: string): void => {
    window.open(url, '_blank')
  }

  // Detect platform for installation instructions
  const isWindows = navigator.platform.toLowerCase().includes('win')
  const isMac = navigator.platform.toLowerCase().includes('mac')

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
              <p className="mb-2">{errorMessage}</p>

              {/* Platform-specific installation instructions */}
              {rubyMissing && (
                <div className="mt-4 text-left text-sm">
                  {isWindows && (
                    <>
                      <p className="font-semibold mb-2">Windows Installation Options:</p>
                      <ol className="list-decimal ml-6 space-y-1">
                        <li>
                          <strong>RubyInstaller</strong> (Recommended):{' '}
                          <a
                            href="https://rubyinstaller.org/downloads/"
                            className="text-blue-600 hover:underline"
                            onClick={(e) => {
                              e.preventDefault()
                              handleNavigation('https://rubyinstaller.org/downloads/')
                            }}
                          >
                            Download Ruby 3.1.6 with DevKit
                          </a>
                        </li>
                        <li>
                          <strong>Chocolatey</strong>: Run <code className="bg-gray-200 px-1">choco install ruby</code> in PowerShell
                        </li>
                      </ol>
                      <p className="mt-2 text-xs text-gray-600">
                        After installation, ensure "Add Ruby to PATH" is selected, then restart Raider Desktop.
                      </p>
                    </>
                  )}
                  {isMac && (
                    <>
                      <p className="font-semibold mb-2">macOS Installation:</p>
                      <ol className="list-decimal ml-6 space-y-1">
                        <li>
                          Install rbenv: <code className="bg-gray-200 px-1">brew install rbenv ruby-build</code>
                        </li>
                        <li>
                          Install Ruby 3.1.6: <code className="bg-gray-200 px-1">rbenv install 3.1.6</code>
                        </li>
                        <li>
                          Set global version: <code className="bg-gray-200 px-1">rbenv global 3.1.6</code>
                        </li>
                      </ol>
                    </>
                  )}
                  {!isWindows && !isMac && (
                    <>
                      <p className="font-semibold mb-2">Linux Installation:</p>
                      <ol className="list-decimal ml-6 space-y-1">
                        <li>
                          Install rbenv: <code className="bg-gray-200 px-1">curl -fsSL https://github.com/rbenv/rbenv-installer/raw/HEAD/bin/rbenv-installer | bash</code>
                        </li>
                        <li>
                          Install Ruby 3.1.6: <code className="bg-gray-200 px-1">rbenv install 3.1.6</code>
                        </li>
                      </ol>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-between space-x-4">
              <Button
                onClick={() => handleNavigation('https://github.com/RaiderHQ/ruby_raider')}
                type="secondary"
              >
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
