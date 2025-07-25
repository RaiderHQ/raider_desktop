import React from 'react'
import Button from '@components/Button'

interface RubyInstallModalProps {
  onInstall: () => void
  onClose: () => void
  missingGems?: string[]
}

const RubyInstallModal: React.FC<RubyInstallModalProps> = ({
  onInstall,
  onClose,
  missingGems
}) => {
  const title = missingGems
    ? 'Missing Dependencies'
    : 'Ruby Installation Required'
  const message = missingGems
    ? `The following gems are missing: ${missingGems.join(
        ', '
      )}. Would you like to install them?`
    : 'In order to use all the features of the Raider Desktop App, you need Ruby in your system. Would you like to install rbenv, Ruby, and all the dependencies?'

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl text-center">
        <h2 className="text-2xl font-bold mb-4">{title}</h2>
        <p className="text-lg mb-6">{message}</p>
        <div className="flex justify-center space-x-4">
          <Button onClick={onInstall} type="success">
            Yes
          </Button>
          <Button onClick={onClose} type="secondary">
            No
          </Button>
        </div>
      </div>
    </div>
  )
}

export default RubyInstallModal
