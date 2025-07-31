import React from 'react'
import Button from '@components/Button'
import { useTranslation } from 'react-i18next'

interface RubyInstallModalProps {
  onClose: () => void
  onCloseApp: () => void
}

const RubyInstallModal: React.FC<RubyInstallModalProps> = ({ onClose, onCloseApp }) => {
  const { t } = useTranslation()
  const title = t('recorder.rubyInstallModal.title')
  const message = t('recorder.rubyInstallModal.message')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center">
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <p className="text-lg mb-6">{message}</p>
        <div className="flex justify-center space-x-4">
          <Button onClick={onCloseApp} type="secondary">
            {t('recorder.rubyInstallModal.close')}
          </Button>
          <Button onClick={onClose} type="success">
            {t('recorder.rubyInstallModal.continue')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default RubyInstallModal
