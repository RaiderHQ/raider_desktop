import React from 'react'
import { useLocation } from 'react-router-dom'
import Button from '@components/Button'
import ContentArea from '@components/ContentArea'
import Logo from '@assets/images/logo.svg'

const ErrorPage: React.FC = () => {
  const location = useLocation()

  // Access the installation state from location.state
  const { isRubyInstalled = true, isRaiderInstalled = false } = location.state || {}

  let message
  let additionalInfo
  if (!isRubyInstalled) {
    message = 'You need to install Ruby'
    additionalInfo = (
      <>
        Ruby is required to run this application.
        <br />
        Check our GitHub page or Website for installation instructions.
      </>
    )
  } else if (!isRaiderInstalled) {
    message = 'You need to install Ruby Raider'
    additionalInfo = (
      <>
        Ruby Raider is required for this project.
        <br />
        Check our GitHub page or Website for installation instructions.
      </>
    )
  } else {
    message = 'Another error appeared!'
    additionalInfo = (
      <>
        An unexpected error has occurred.
        <br />
        Please try again or contact support if the issue persists.
      </>
    )
  }

  const handleGoToWebsite = () => {
    window.open('https://ruby-raider.com/', '_blank') // Open official website in a new tab
  }

  const handleGoToGitHub = () => {
    window.open('https://github.com/RaiderHQ/ruby_raider', '_blank')
  }

  return (
    <div className="min-h-screen w-[80vw] flex items-center justify-center">
      <ContentArea className="mx-auto">
        <div className="flex flex-col items-center justify-center">
          <div className="mb-2">
            <img src={Logo} alt="Ruby Raider Logo" className="w-28 h-auto" />
          </div>
          <div className="bg-white p-4 text-center">
            <h1 className="text-3xl font-bold mb-3 text-gray-900">{message}</h1>
            <div className="bg-gray-100 text-gray-700 p-3 mb-4 rounded-md">
              <p>{additionalInfo}</p>
            </div>
            <div className="flex justify-between space-x-4">
              <Button onClick={handleGoToGitHub} type="secondary">
                Go to GitHub
              </Button>
              <Button onClick={handleGoToWebsite} type="primary">
                Go to Website
              </Button>
            </div>
          </div>
        </div>
      </ContentArea>
    </div>
  )
}

export default ErrorPage
