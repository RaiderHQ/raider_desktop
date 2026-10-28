import React, { useState } from 'react'
import ReactDOM from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import Button from '@components/Button'
import InputField from '@components/InputField'
import RubyInstallModal from '@components/RubyInstallModal'
import useProjectStore from '@foundation/Stores/projectStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useRubyStore from '@foundation/Stores/rubyStore'

interface QuickRecordDialogProps {
  onClose: () => void
}

/** Asks for a website and a test name, then opens a throwaway project ready to record. */
const QuickRecordDialog: React.FC<QuickRecordDialogProps> = ({ onClose }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { rubyCommand } = useRubyStore()
  const setProjectPath = useProjectStore((s) => s.setProjectPath)
  const [url, setUrl] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  // Without Ruby there is nothing to create the project with
  if (!rubyCommand) {
    return <RubyInstallModal onClose={onClose} onCloseApp={() => window.api.closeApp()} />
  }

  const canStart = url.trim() !== '' && name.trim() !== '' && !creating

  // Main only accepts http(s), so a bare address like example.com gets https://
  const normalizedUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`

  const start = async (): Promise<void> => {
    if (!canStart) return
    setCreating(true)
    try {
      const result = await window.api.createQuickProject(normalizedUrl, rubyCommand)
      if (!result.success) {
        toast.error(t('quickRecord.error', { error: result.error }))
        return
      }
      setProjectPath(result.projectPath)
      // After activation: switching projects clears the recorder's open test
      useRecorderStore.getState().startDraft(name.trim(), normalizedUrl)
      onClose()
      navigate('/overview/tests/new')
    } catch (error) {
      toast.error(t('quickRecord.error', { error: String(error) }))
    } finally {
      setCreating(false)
    }
  }

  return ReactDOM.createPortal(
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        role="dialog"
        aria-label={t('quickRecord.title')}
        className="bg-white rounded-xl shadow-elevated w-full max-w-md p-6 space-y-4"
      >
        <h2 className="text-lg font-semibold text-neutral-dark">{t('quickRecord.title')}</h2>
        <InputField
          label={t('quickRecord.urlLabel')}
          placeholder={t('quickRecord.urlPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={creating}
          autoFocus
        />
        <InputField
          label={t('quickRecord.nameLabel')}
          placeholder={t('quickRecord.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void start()}
          disabled={creating}
        />
        <div className="flex justify-end gap-2">
          <Button type="secondary" onClick={onClose} disabled={creating}>
            {t('quickRecord.cancel')}
          </Button>
          <Button onClick={() => void start()} disabled={!canStart}>
            {creating ? t('quickRecord.starting') : t('quickRecord.start')}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default QuickRecordDialog
