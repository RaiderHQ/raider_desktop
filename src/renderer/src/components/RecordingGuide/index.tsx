import React, { useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import { useTranslation } from 'react-i18next'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { markGuideSeen } from '@foundation/recordingGuideSeen'
import { platformFrom, shortcutLabel } from '@shared/shortcuts'

interface RecordingGuideProps {
  /** A card above the steps while recording, or a modal when nothing is recording */
  variant: 'card' | 'modal'
  onClose?: () => void
}

/**
 * Help › Recording guide: with a recording layout showing, reopen its card; otherwise
 * call `showModal`. Main calls this once the 'recording-guide' menu command lands.
 */
export function openRecordingGuide(showModal: () => void): void {
  const { recordingUrl, setGuideOpen } = useRecorderStore.getState()
  if (recordingUrl) setGuideOpen(true)
  else showModal()
}

const Chip: React.FC<{ id: 'stop' | 'run' }> = ({ id }) => (
  <kbd className="ml-1.5 px-1 rounded bg-neutral-100 border border-neutral-bdr font-sans text-xs">
    {shortcutLabel(id, platformFrom(navigator.platform))}
  </kbd>
)

const RecordingGuide: React.FC<RecordingGuideProps> = ({ variant, onClose }) => {
  const { t } = useTranslation()
  const setGuideOpen = useRecorderStore((state) => state.setGuideOpen)

  const close = (): void => {
    markGuideSeen()
    setGuideOpen(false)
    onClose?.()
  }

  const gotItRef = useRef<HTMLButtonElement>(null)
  const modal = variant === 'modal'
  useEffect(() => {
    if (!modal) return
    const previous = document.activeElement as HTMLElement | null
    gotItRef.current?.focus()
    return (): void => previous?.focus?.()
  }, [modal])

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      // The only control is Got it: keep focus on it
      e.preventDefault()
      gotItRef.current?.focus()
    }
  }

  const body = (
    <div
      {...(modal ? { role: 'dialog', 'aria-modal': true, onKeyDown } : { role: 'region' })}
      aria-labelledby="recording-guide-title"
      className="rounded-lg border border-neutral-bdr border-l-4 border-l-ruby bg-white p-4 shadow-elevated"
    >
      <h2 id="recording-guide-title" className="text-sm font-semibold text-neutral-dark mb-2">
        {t('guide.title')}
      </h2>
      <ol className="list-decimal pl-5 space-y-1.5 text-sm text-neutral-dark">
        <li>{t('guide.step1')}</li>
        <li>{t('guide.step2')}</li>
        <li>
          {t('guide.step3Before')}
          <Chip id="stop" />
          {t('guide.step3Middle')}
          <Chip id="run" />
          {t('guide.step3After')}
        </li>
      </ol>
      <div className="mt-3 flex items-center justify-between">
        {/* "Learn more about assertions" (guide.learnMore, data-docs="docs.assertions") returns
            as a DocsLink once PR D lands; until then it would be a button that does nothing */}
        <span />
        <button
          ref={gotItRef}
          type="button"
          onClick={close}
          className="px-3 py-1 text-sm rounded bg-neutral-dark text-white"
        >
          {t('guide.gotIt')}
        </button>
      </div>
    </div>
  )

  if (variant === 'card') return body
  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={close}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        {body}
      </div>
    </div>,
    document.body
  )
}

export default RecordingGuide
