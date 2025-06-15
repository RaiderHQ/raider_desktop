import React from 'react'
import { useTranslation } from 'react-i18next'
import ContentArea from '@components/ContentArea'

interface OutputPanelProps {
  output: string
}

const OutputPanel: React.FC<OutputPanelProps> = ({ output }) => {
  const { t } = useTranslation()

  return (
    <div className="w-full h-full">
      <ContentArea>
        <div className="flex flex-col h-full">
          <h3 className="text-lg font-semibold mb-2 text-black">
            {t('recorder.heading.runOutput')}
          </h3>
          <pre className="w-full flex-grow p-2 mt-2 border rounded bg-black text-white border-gray-700 resize-none text-sm overflow-auto whitespace-pre-wrap">
            {output || 'Test output will appear here...'}
          </pre>
        </div>
      </ContentArea>
    </div>
  )
}

export default OutputPanel
