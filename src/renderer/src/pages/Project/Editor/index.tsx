import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Button from '@components/Button'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Editor from '@components/Editor'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { getFileLanguage } from '@foundation/helpers'

interface FileEditorProps {
  fileName: string
  filePath: string
}

const FileEditor: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()

  // Extract state passed during navigation
  const { fileName, filePath } = location.state as FileEditorProps

  // Initialize state with the file content
  const [fileContent, setFileContent] = useState<string>('')
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  useEffect((): void => {
    getFileContents()
  }, [])

  const handleSave = async (): Promise<void> => {
    if (!filePath || filePath.trim() === '') {
      toast.error(t('editor.error.invalidFilePath'))
      return
    }

    setIsSaving(true)
    try {
      const response = await window.api.editFile(filePath, fileContent)
      if (!response.success) {
        toast.error(t('editor.error.saveFailed', { fileName }))
      }

      toast.success(t('editor.success'))
    } catch (error) {
      toast.error(t('editor.error.unexpectedSaveError'))
    } finally {
      setIsSaving(false)
    }
  }

  const getFileContents = async (): Promise<void> => {
    try {
      setIsLoading(true)
      const result = await window.api.readFile(filePath)

      if (!result.success) {
        console.error('Error reading the file', result.error)
        toast.error(t('overview.error.readFile'))
        return
      }

      setFileContent(result.data)
    } catch (err) {
      console.error('Error reading file', err)
      toast.error(t('overview.error.unexpectedReadFile'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col w-screen h-screen p-8">
      <div className="flex items-center justify-between mb-4 bg-gray-200 p-2 rounded-md">
        <div className="flex space-x-2">
          <Button onClick={() => navigate('/project/overview')} type="secondary">
            {t('editor.buttons.backToOverview')}
          </Button>
          <Button onClick={handleSave} type="primary" disabled={isSaving}>
            {t(`editor.buttons.${isSaving ? 'saving' : 'save'}`)}
          </Button>
        </div>
      </div>

      <div className="flex flex-col flex-grow border rounded-lg shadow-sm overflow-hidden bg-white p-4">
        {isLoading && <h2>{t('editor.loading')}</h2>}
        {!isLoading && (
          <>
            <h2 className="text-xl font-semibold mb-4">{fileName}</h2>
            <Editor
              value={fileContent}
              language={getFileLanguage(filePath)}
              onChange={(value: string | undefined) => setFileContent(value || '')}
            />
          </>
        )}
      </div>
    </div>
  )
}

export default FileEditor
