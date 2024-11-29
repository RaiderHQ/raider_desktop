import React, { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Button from '@components/Button'

interface FileEditorProps {
  fileName: string
  filePath: string
  fileContent: string
}

const Editor: React.FC = () => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  // Extract state passed during navigation
  const { fileName, filePath, fileContent: initialContent } = location.state as FileEditorProps

  // Initialize state with the file content
  const [fileContent, setFileContent] = useState(initialContent)
  const [isSaving, setIsSaving] = useState(false) // State to track save operation

  const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFileContent(event.target.value)
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const handleSave = async () => {
    if (!filePath || filePath.trim() === '') {
      console.error(t('editor.error.invalidFilePath'))
      return
    }

    setIsSaving(true) // Start saving state
    try {
      await sleep(1000) // Add 1-second delay
      const response = await window.api.editFile(filePath, fileContent)
      if (!response.success) {
        console.error(t('editor.error.saveFailed', { fileName }))
        alert(t('editor.error.saveFailed', { fileName }))
      }
    } catch (error) {
      console.error(t('editor.error.unexpectedSaveError'))
      alert(t('editor.error.unexpectedSaveError'))
    } finally {
      setIsSaving(false) // Stop saving state
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
            {t('editor.buttons.backToOverview')}
          </Button>
          <Button onClick={handleSave} type="primary" disabled={isSaving}>
            {isSaving ? t('editor.buttons.saving') : t('editor.buttons.save')}
          </Button>
        </div>
      </div>

      <div className="flex flex-col flex-grow border rounded-lg shadow-sm overflow-hidden bg-white p-4">
        <h2 className="text-xl font-semibold mb-4">{fileName}</h2>
        <textarea
          value={fileContent}
          onChange={handleContentChange}
          className="flex-grow border p-2 rounded-lg w-full resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={t('editor.placeholder')}
        />
      </div>
    </div>
  )
}

export default Editor
