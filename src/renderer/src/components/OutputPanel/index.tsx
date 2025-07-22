import React from 'react'

interface OutputPanelProps {
  output: string
}

const OutputPanel: React.FC<OutputPanelProps> = ({ output }) => {
  return (
    <div className="flex flex-col h-full">
      <pre className="w-full flex-grow p-2 mt-2 border rounded bg-black text-white border-gray-700 resize-none text-sm overflow-auto whitespace-pre-wrap">
        {output || 'Test output will appear here...'}
      </pre>
    </div>
  )
}

export default OutputPanel
