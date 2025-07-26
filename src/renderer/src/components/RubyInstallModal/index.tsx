import React from 'react'
import Button from '@components/Button'
import { useTranslation } from 'react-i18next'

interface RubyInstallModalProps {
  onInstall: () => void
  onClose: () => void
  missingGems?: string[]
}

const RubyInstallModal: React.FC<RubyInstallModalProps> = ({ onInstall, onClose, missingGems }) => {
  const { t } = useTranslation()
  const title = missingGems
    ? t('recorder.rubyInstallModal.title.missing')
    : t('recorder.rubyInstallModal.title.required')
  const message = missingGems
    ? t('recorder.rubyInstallModal.message.missing', { missingGems: missingGems.join(', ') })
    : t('recorder.rubyInstallModal.message.required')

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center">
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <p className="text-lg mb-6">{message}</p>
        <div className="flex justify-center space-x-4">
          <Button onClick={onInstall} type="success">
            {t('recorder.rubyInstallModal.yes')}
          </Button>
          <Button onClick={onClose} type="secondary">
            {t('recorder.rubyInstallModal.no')}
          </Button>
        </div>
      </div>
    </div>
  )
}

export default RubyInstallModal
