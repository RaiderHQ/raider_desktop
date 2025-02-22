import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationCircle,
  FaChevronRight,
  FaChevronDown,
  FaImage,
  FaTimes,
} from 'react-icons/fa'
import toast from 'react-hot-toast'

interface TestResultCardProps {
  name: string
  status: string
  screenshot?: string
  message?: string
}

const TestResultCard: React.FC<TestResultCardProps> = ({ name, status, screenshot, message }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [imageData, setImageData] = useState<string>('')

  let statusIcon = null
  if (status === 'passed') {
    statusIcon = <FaCheckCircle className="text-green-500" />
  } else if (status === 'failed') {
    statusIcon = <FaTimesCircle className="text-red-500" />
  } else if (status === 'skipped') {
    statusIcon = <FaExclamationCircle className="text-gray-500" />
  }

  const chevronIcon = open ? <FaChevronDown /> : <FaChevronRight />

  useEffect(() => {
    if (showModal && screenshot) {
      window.api
        .readImage(screenshot)
        .then((res: { success: boolean; data?: string; error?: string }) => {
          if (res.success && res.data) {
            const dataUrl = `data:image/png;base64,${res.data}`
            setImageData(dataUrl)
          } else {
            toast.error(`${t('testResults.error.imageRead')}: ${res.error}`)
          }
        })
        .catch(() => {
          toast.error(t('testResults.error.imageAccess'))
        })
    }
  }, [showModal, screenshot, t])

  return (
    <div className="p-4 border rounded shadow">
      <div className="flex items-center justify-between cursor-pointer" onClick={() => setOpen(!open)}>
        <div className="flex items-center">
          <div className="mr-2">{chevronIcon}</div>
          <h2 className="font-semibold">{name}</h2>
        </div>
        <div className="pl-4">{statusIcon}</div>
      </div>
      {open && (
        <div className="mt-2">
          <p>{t('testResults.status')}: {t(`testResults.${status}`)}</p>
          {message && (
            <p className="mt-2 text-sm text-gray-600">{message}</p>
          )}
          {screenshot && (
            <button
              onClick={() => setShowModal(true)}
              className="text-blue-500 flex items-center mt-2"
            >
              <FaImage className="mr-1" />
              <span className="underline">{t('testResults.viewScreenshot')}</span>
            </button>
          )}
        </div>
      )}
      {showModal && imageData && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <button
            onClick={() => setShowModal(false)}
            className="absolute top-4 right-4 text-white text-2xl"
          >
            <FaTimes />
          </button>
          <div className="relative">
            <img
              src={imageData}
              alt="Screenshot"
              className="max-w-full max-h-full"
              onError={(e) => console.error('Error loading image:', e)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default TestResultCard
