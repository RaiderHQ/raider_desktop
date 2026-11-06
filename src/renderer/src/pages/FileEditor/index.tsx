import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { sample } from 'lodash'
import Editor from '@components/Editor'
import EditorSaveBar from '@components/EditorSaveBar'
import Tooltip from '@components/Tooltip'
import UnsavedChangesModal from '@components/UnsavedChangesModal'
import { getFileLanguage } from '@foundation/helpers'
import { onMenuCommand } from '@foundation/menuCommands'
import { FaArrowLeft } from 'react-icons/fa'

interface FileEditorProps {
  fileName: string
  filePath: string
  line?: number
  /** Where the back button goes: the page the file was opened from */
  returnTo?: string
}

const FileEditor: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()

  const { fileName, filePath, line, returnTo } = location.state as FileEditorProps

  const [fileContent, setFileContent] = useState<string>('')
  // What is on disk, as far as this page knows; the file is dirty when the editor differs
  const [savedContent, setSavedContent] = useState<string>('')
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [leaving, setLeaving] = useState(false)
  const dirty = fileContent !== savedContent

  // One write at a time; a ref so a Cmd+S repeat in the same tick can't start a second one
  const savingRef = useRef(false)

  /** Writes the file; true when it is on disk afterwards. */
  const handleSave = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false
    savingRef.current = true
    const loadingTypes: string[] = ['stashing', 'securing', 'engraving', 'prize', 'ruby']
    const toastId: string = toast.loading(t(`editor.save.${sample(loadingTypes)}`))

    if (!filePath || filePath.trim() === '') {
      toast.error(t('editor.error.invalidFilePath'), { id: toastId })
      savingRef.current = false
      return false
    }

    setIsSaving(true)
    try {
      const response = await window.api.editFile(filePath, fileContent)
      if (!response.success) {
        toast.error(t('editor.error.saveFailed', { fileName }), { id: toastId })
        return false
      }
      setSavedContent(fileContent)
      toast.success(t('editor.success'), { id: toastId })
      return true
    } catch (error) {
      toast.error(t('editor.error.unexpectedSaveError'), { id: toastId })
      return false
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }, [filePath, fileContent, fileName, t])

  const goBack = (): void => {
    void navigate(returnTo ?? '/overview')
  }

  const leave = (): void => {
    if (dirty) setLeaving(true)
    else goBack()
  }

  const saveAndLeave = async (): Promise<void> => {
    if (await handleSave()) goBack()
    else setLeaving(false)
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
      setSavedContent(result.data || '')
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
        if (dirty) void handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    const offMenu = onMenuCommand((command) => {
      if (command === 'save' && dirty) void handleSave()
    })
    return (): void => {
      window.removeEventListener('keydown', handleKeyDown)
      offMenu()
    }
  }, [handleSave, dirty])

  return (
    <div className="flex flex-col w-screen p-8">
      <div className="relative w-full">
        <div className="relative h-[70vh] flex flex-col border border-neutral-bdr rounded-lg shadow-card overflow-hidden bg-white">
          {isLoading ? (
            <h2>{t('editor.loading')}</h2>
          ) : (
            <>
              <EditorSaveBar
                fileName={fileName}
                dirty={dirty}
                saving={isSaving}
                onSave={() => void handleSave()}
              >
                <Tooltip content={t('tooltips.fileEditor.back')} position="bottom">
                  <button
                    onClick={leave}
                    aria-label={t('editor.back')}
                    className="focus:outline-none text-neutral-dk hover:text-ruby transition-colors"
                  >
                    <FaArrowLeft />
                  </button>
                </Tooltip>
              </EditorSaveBar>
              <div className="flex-1 min-h-0">
                <Editor
                  value={fileContent}
                  language={getFileLanguage(filePath)}
                  revealLine={line}
                  onChange={(value: string | undefined) => setFileContent(value || '')}
                />
              </div>
            </>
          )}
        </div>
      </div>
      {leaving && (
        <UnsavedChangesModal
          fileName={fileName}
          onSave={() => void saveAndLeave()}
          onDiscard={goBack}
          onCancel={() => setLeaving(false)}
        />
      )}
    </div>
  )
}

export default FileEditor
