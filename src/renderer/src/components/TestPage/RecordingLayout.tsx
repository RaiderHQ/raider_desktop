import React, { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import StyledPanel from '@components/StyledPanel'
import { RECORDER_PARTITION } from '@shared/recorderSession'
import type { TestRecording } from '../../hooks/useTestRecording'

interface RecordingLayoutProps {
  /** The steps, on the left */
  steps: React.ReactNode
  recording: Pick<TestRecording, 'recordingUrl' | 'preloadPath' | 'cancelReplay'>
  isReplaying: boolean
}

/** While recording: the steps on the left, the embedded website being recorded on the right. */
const RecordingLayout: React.FC<RecordingLayoutProps> = ({ steps, recording, isReplaying }) => {
  const { t } = useTranslation()
  return (
    <div className="flex-1 flex flex-row gap-4 min-h-[24rem]">
      <div className="w-[40%] min-h-0">
        <StyledPanel>{steps ?? <></>}</StyledPanel>
      </div>
      <div className="w-[60%] border border-neutral-bdr rounded-lg overflow-hidden bg-white relative">
        <RecordingBrowser url={recording.recordingUrl} preloadPath={recording.preloadPath} />
        {isReplaying && (
          <div className="absolute inset-0 bg-amber-50/60 flex flex-col items-center justify-center gap-3 z-10">
            <p className="text-sm font-medium text-amber-700">
              {t('recorder.mainRecorderPanel.replaying')}
            </p>
            <button
              onClick={() => void recording.cancelReplay()}
              className="px-4 py-1.5 text-sm rounded border border-amber-400 bg-white text-amber-700 hover:bg-amber-50 font-medium"
            >
              {t('recorder.breakpoint.stopReplay')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** The embedded website being recorded; registers itself with main once loaded. */
const RecordingBrowser: React.FC<{ url: string | null; preloadPath: string | null }> = ({
  url,
  preloadPath
}) => {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  if (!url || !preloadPath) return null
  return (
    <webview
      ref={(el: HTMLElement | null) => {
        const wv = el as unknown as Electron.WebviewTag | null
        if (wv && wv !== webviewRef.current) {
          webviewRef.current = wv
          wv.addEventListener('dom-ready', () => {
            window.api.registerRecorderWebContents(wv.getWebContentsId())
          })
        }
      }}
      src={url}
      partition={RECORDER_PARTITION}
      preload={`file://${preloadPath}`}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

export default RecordingLayout
