import React from 'react'

interface DryRunModalProps {
  title: string
  output: string
  onProceed: () => void
  onCancel: () => void
}

const DryRunModal: React.FC<DryRunModalProps> = ({ title, output, onProceed, onCancel }) => {
  const files = output
    .split('\n')
    .filter((line) => line.trim())

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-neutral-bdr">
          <h3 className="text-lg font-semibold text-neutral-dark">{title}</h3>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <p className="text-sm text-neutral-mid mb-3">
            The following files will be generated:
          </p>
          <div className="bg-neutral-lt rounded-md p-3">
            {files.map((file, index) => (
              <div key={index} className="text-sm font-mono text-neutral-dk py-0.5">
                {file}
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-bdr">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-neutral-dk bg-neutral-lt rounded-md hover:bg-neutral-bdr transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onProceed}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  )
}

export default DryRunModal
