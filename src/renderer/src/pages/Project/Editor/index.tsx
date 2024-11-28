import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Button from '@components/Button'

interface FileEditorProps {
  fileName: string
  filePath: string
  fileContent: string
}

const Editor: React.FC = () => {
  const location = useLocation()
  const navigate = useNavigate()

  // Extract state passed during navigation
  const { fileName, filePath, fileContent: initialContent } = location.state as FileEditorProps

  // Initialize state with the file content
  const [fileContent, setFileContent] = useState(initialContent)

  const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFileContent(event.target.value)
  }

  const handleSave = async () => {
    if (!filePath || filePath.trim() === '') {
      console.error('Invalid filePath:', filePath)
      return
    }

    try {
      const response = await window.api.editFile(filePath, fileContent)
      if (!response.success) {
        console.error(`Error saving file "${fileName}":`, response.error)
        alert('Error saving file. Please try again.')
      }
    } catch (error) {
      console.error('Unexpected error saving file:', error)
      alert('Unexpected error occurred. Please try again.')
    }
  }

  const handleBackToOverview = () => {
    navigate('/project/overview') // Navigate back to the overview page
  }

  return (
    <div className="flex flex-col w-screen h-screen p-8">
      <div className="flex items-center justify-between mb-4 bg-gray-200 p-2 rounded-md">
        <div className="flex space-x-2">
          <Button onClick={handleBackToOverview} type="secondary">
            Back to Overview
          </Button>
          <Button onClick={handleSave} type="primary">
            Save
          </Button>
        </div>
      </div>

      <div className="flex flex-col flex-grow border rounded-lg shadow-sm overflow-hidden bg-white p-4">
        <h2 className="text-xl font-semibold mb-4">{fileName}</h2>
        <textarea
          value={fileContent}
          onChange={handleContentChange}
          className="flex-grow border p-2 rounded-lg w-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Start editing file content here..."
        />
      </div>
    </div>
  )
}

export default Editor
