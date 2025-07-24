import React, { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { sample } from 'lodash'
import Editor from '@components/Editor'
import { getFileLanguage } from '@foundation/helpers'
import { FaArrowLeft } from 'react-icons/fa'

interface FileEditorProps {
  fileName: string
  filePath: string
}

const FileEditor: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const { fileName, filePath } = location.state as FileEditorProps

  const [fileContent, setFileContent] = useState<string>('')
  const [, setIsSaving] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)

  const handleSave = async (): Promise<void> => {
    const loadingTypes: string[] = ['stashing', 'securing', 'engraving', 'prize', 'ruby']
    const toastId: string = toast.loading(t(`editor.save.${sample(loadingTypes)}`))

    if (!filePath || filePath.trim() === '') {
      toast.error(t('editor.error.invalidFilePath', { id: toastId }))
      return
    }

    setIsSaving(true)
    try {
      const response = await window.api.editFile(filePath, fileContent)
      if (!response.success) {
        toast.error(t('editor.error.saveFailed', { fileName }), { id: toastId })
        return
      }
      toast.success(t('editor.success'), { id: toastId })
    } catch (error) {
      toast.error(t('editor.error.unexpectedSaveError'), { id: toastId })
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

      setFileContent(result.data || '')
    } catch (err) {
      console.error('Error reading file', err)
      toast.error(t('overview.error.unexpectedReadFile'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect((): void => {
    getFileContents()
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return (): void => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  return (
    <div className="flex flex-col w-screen p-8">
      <div className="relative w-full">
        <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
        <div className="relative h-[70vh] border rounded-lg shadow-sm overflow-y-auto bg-white z-10">
          {isLoading ? (
            <h2>{t('editor.loading')}</h2>
          ) : (
            <>
              <div className="flex items-center mb-4">
                <button
                  onClick={() => navigate('/overview')}
                  className="mr-2 ml-2 focus:outline-none"
                >
                  <FaArrowLeft />
                </button>
                <h2 className="text-xl font-semibold">{fileName}</h2>
              </div>
              <div className="flex-grow overflow-y-auto">
                <Editor
                  value={fileContent}
                  language={getFileLanguage(filePath)}
                  onChange={(value: string | undefined) => setFileContent(value || '')}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default FileEditor
