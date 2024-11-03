import React from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@components/Button'

interface ErrorPageProps {
  isRubyInstalled: boolean
  isRaiderInstalled: boolean
}

const ErrorPage: React.FC<ErrorPageProps> = ({ isRubyInstalled, isRaiderInstalled }) => {
  const navigate = useNavigate()
  let message

  if (!isRubyInstalled) {
    message = 'You need to install Ruby'
  } else if (!isRaiderInstalled) {
    message = 'You need to install Ruby Raider'
  } else {
    message = 'Another error appeared!'
  }

  const handleGoHome = () => {
    navigate('/') // Navigate to the home page
  }

  return (
    <div className="text-center">
      <h1 className="mb-4">{message}</h1>
      <Button onClick={handleGoHome} type="primary">
        Go to Home
      </Button>
    </div>
  )
}

export default ErrorPage
