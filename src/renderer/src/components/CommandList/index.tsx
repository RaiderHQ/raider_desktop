import React from 'react'
import CommandBlock from '@components/CommandBlock'
import { useTranslation } from 'react-i18next'

interface CommandListProps {
  steps: string[]
}

const CommandList: React.FC<CommandListProps> = ({ steps }) => {
  const { t } = useTranslation()

  return (
    // This container will hold all the command blocks and will be scrollable if they overflow.
    <div className="w-full h-full overflow-y-auto p-1 bg-gray-200 rounded-b-md">
      {steps.length > 0 ? (
        steps.map((step, index) => <CommandBlock key={index} command={step} />)
      ) : (
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-400">{t('recorder.placeholder.commands')}</p>
        </div>
      )}
    </div>
  )
}

export default CommandList
