import React from 'react'
import { useTranslation } from 'react-i18next'

interface OutputPanelProps {
  output: string
}

const OutputPanel: React.FC<OutputPanelProps> = ({ output }) => {
  const { t } = useTranslation()

  const formatOutput = (text: string): string => {
    try {
      const parsed = JSON.parse(text)
      if (parsed.summary && parsed.examples) {
        let formatted = `${t('recorder.outputPanel.title')}\n\n`
        parsed.examples.forEach(
          (example: { description: string; status: string; exception?: { message: string } }) => {
            formatted += `  - ${example.description}: ${example.status.toUpperCase()}\n`
            if (example.status === 'failed' && example.exception) {
              formatted += `    ${t('recorder.outputPanel.error')} ${example.exception.message}\n`
            }
          }
        )
        formatted += `\n${parsed.summary_line}`
        return formatted
      }
      return JSON.stringify(parsed, null, 2)
    } catch (error) {
      return text
    }
  }

  return (
    <div className="flex flex-col h-full">
      <pre className="w-full flex-grow p-2 mt-2 border rounded bg-black text-white border-gray-700 resize-none text-sm overflow-auto whitespace-pre-wrap">
        {formatOutput(output) || t('recorder.outputPanel.placeholder')}
      </pre>
    </div>
  )
}

export default OutputPanel
