import React from 'react'

interface OutputPanelProps {
  output: string
}

const OutputPanel: React.FC<OutputPanelProps> = ({ output }) => {
  const formatOutput = (text: string) => {
    try {
      const parsed = JSON.parse(text)
      if (parsed.summary && parsed.examples) {
        let formatted = 'Test Results:\n\n'
        parsed.examples.forEach((example: any) => {
          formatted += `  - ${example.description}: ${example.status.toUpperCase()}\n`
          if (example.status === 'failed' && example.exception) {
            formatted += `    Error: ${example.exception.message}\n`
          }
        })
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
        {formatOutput(output) || 'Test output will appear here...'}
      </pre>
    </div>
  )
}

export default OutputPanel
