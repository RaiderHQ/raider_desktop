import React, { useState } from 'react'
import Button from '@components/Button'
import InputField from '@components/InputField'

interface AssertionTextModalProps {
  initialText: string
  onSave: (text: string) => void
  onClose: () => void
}

const AssertionTextModal: React.FC<AssertionTextModalProps> = ({ initialText, onSave, onClose }) => {
  const [text, setText] = useState(initialText)

  const handleSave = (): void => {
    onSave(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      handleSave()
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <h2 className="text-lg font-semibold mb-4">Assert Element Text</h2>
        <p className="mb-4 text-sm text-gray-600">
          Enter the exact text you expect the element to contain.
        </p>
        <InputField
          label="Expected Text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <div className="mt-6 flex justify-end space-x-2">
          <Button type="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" onClick={handleSave}>
            Save Assertion
          </Button>
        </div>
      </div>
    </div>
  )
}

export default AssertionTextModal
