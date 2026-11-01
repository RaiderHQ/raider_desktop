import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import useProjectStore from '@foundation/Stores/projectStore'

interface NewTestFormProps {
  onStart: (name: string, url: string) => void
  onCancel: () => void
  /** Recording isn't possible in this project */
  disabled?: boolean
  /** Why recording isn't possible, shown under the form */
  disabledReason?: string
}

const field =
  'block w-full px-3 py-1 border border-neutral-bdr rounded text-sm focus:ring-ruby focus:border-ruby transition-colors'

/** Names a new test and picks where its recording starts; nothing is saved until it stops. */
const NewTestForm: React.FC<NewTestFormProps> = ({
  onStart,
  onCancel,
  disabled = false,
  disabledReason
}) => {
  const { t } = useTranslation()
  const projectPath = useProjectStore((s) => s.projectPath)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const urlEdited = useRef(false)

  // Starts at the project's base URL, unless the user already typed one
  useEffect(() => {
    if (!projectPath) return
    let current = true
    Promise.resolve(window.api.getProjectConfig(projectPath))
      .then((result) => {
        const baseUrl = result?.success ? result.config?.baseUrl : undefined
        if (current && baseUrl && !urlEdited.current) setUrl(baseUrl)
      })
      .catch((error: unknown) => console.error('Reading the project base URL failed:', error))
    return (): void => {
      current = false
    }
  }, [projectPath])

  const canStart = name.trim() !== '' && !disabled
  const start = (): void => {
    if (canStart) onStart(name.trim(), url.trim())
  }

  return (
    <form
      className="space-y-4 max-w-xl"
      onSubmit={(e) => {
        e.preventDefault()
        start()
      }}
    >
      <input
        type="text"
        className={field}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('testPage.name')}
        aria-label={t('testPage.name')}
        required
        autoFocus
      />
      <input
        type="text"
        className={field}
        value={url}
        onChange={(e) => {
          urlEdited.current = true
          setUrl(e.target.value)
        }}
        placeholder={t('testPage.url')}
        aria-label={t('testPage.url')}
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!canStart}
          title={disabled ? disabledReason : undefined}
          className="text-sm px-3 py-1.5 rounded bg-ruby text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('tests.startRecording')}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm px-3 py-1.5 rounded border border-neutral-bdr bg-white text-neutral-dk font-medium hover:bg-neutral-50 transition-colors"
        >
          {t('common.cancel')}
        </button>
      </div>
      {disabled && disabledReason && <p className="text-xs text-neutral-mid">{disabledReason}</p>}
    </form>
  )
}

export default NewTestForm
