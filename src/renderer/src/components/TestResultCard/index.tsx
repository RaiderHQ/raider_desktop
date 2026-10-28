import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FaCheckCircle,
  FaTimesCircle,
  FaExclamationCircle,
  FaChevronRight,
  FaChevronDown,
  FaImage,
  FaTimes,
  FaRoute,
  FaShieldAlt
} from 'react-icons/fa'
import toast from 'react-hot-toast'
import TraceTimeline from '@components/TraceTimeline'
import TraceDetailPanel from '@components/TraceDetailPanel'
import FailureDetails from '@components/FailureDetails'
import { MessageContent } from './MessageContent'
import Tooltip from '@components/Tooltip'
import { toMediaUrl } from '@foundation/mediaUrl'
import type { TraceStep } from '@foundation/Types/traceStep'
import type { FailureInfo } from '@foundation/Types/testResult'

interface TestResultCardProps {
  name: string
  status: string
  screenshot?: string
  video?: string
  message?: string | null
  backtrace?: string[]
  traceTestId?: string
  failure?: FailureInfo
  durationMs?: number
  browser?: string
  projectPath?: string
}

const TestResultCard: React.FC<TestResultCardProps> = ({
  name,
  status,
  screenshot,
  video,
  message,
  backtrace,
  traceTestId,
  failure,
  durationMs,
  browser,
  projectPath
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [imageData, setImageData] = useState<string>('')
  const [showTrace, setShowTrace] = useState(false)
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([])
  const [selectedTraceStepId, setSelectedTraceStepId] = useState<string | null>(null)
  const [traceLoading, setTraceLoading] = useState(false)

  let statusIcon: JSX.Element | null = null

  if (status === 'passed') {
    statusIcon = <FaCheckCircle className="text-status-ok" />
  } else if (status === 'failed' || status === 'broken') {
    statusIcon = <FaTimesCircle className="text-red-500" />
  } else if (status === 'skipped' || status === 'pending') {
    statusIcon = <FaExclamationCircle className="text-neutral-mid" />
  } else if (status === 'quarantined') {
    statusIcon = (
      <Tooltip content={t('testResults.quarantinedTooltip')} position="left">
        <span
          data-testid="quarantined-badge"
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide rounded-md bg-status-quarantine-bg text-status-quarantine"
        >
          <FaShieldAlt />
          {t('testResults.quarantined')}
        </span>
      </Tooltip>
    )
  }

  const isFailing = status === 'failed' || status === 'broken'
  const showFailureDetails = isFailing && !!failure

  const chevronIcon = open ? <FaChevronDown /> : <FaChevronRight />

  useEffect(() => {
    if (showModal && screenshot) {
      window.api
        .readImage(screenshot)
        .then((res: { success: boolean; data?: string; error?: string }) => {
          if (res.success && res.data) {
            const dataUrl = `data:image/png;base64,${res.data}`
            setImageData(dataUrl)
          } else {
            toast.error(`${t('testResults.error.imageRead')}: ${res.error}`)
          }
        })
        .catch(() => {
          toast.error(t('testResults.error.imageAccess'))
        })
    }
  }, [showModal, screenshot, t])

  const handleToggleTrace = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (showTrace) {
      setShowTrace(false)
      return
    }
    if (traceSteps.length > 0) {
      setShowTrace(true)
      return
    }
    setTraceLoading(true)
    try {
      const result = await window.api.loadTrace(traceTestId!)
      if (result.success && result.trace) {
        setTraceSteps(result.trace)
        setSelectedTraceStepId(null)
        setShowTrace(true)
      }
    } finally {
      setTraceLoading(false)
    }
  }

  return (
    <div className="border border-neutral-bdr rounded-lg bg-white">
      <div
        className="flex items-center justify-between cursor-pointer px-4 py-3"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-neutral-mid shrink-0">{chevronIcon}</span>
          <span className="text-sm font-semibold text-neutral-dark truncate">{name}</span>
        </div>
        <div className="pl-4 shrink-0">{statusIcon}</div>
      </div>

      {open && (
        <div className="border-t border-neutral-bdr px-4 py-3">
          <p className="text-xs text-neutral-mid mb-1">
            {t('testResults.status')}: <span className="font-medium text-neutral-dk">{t(`testResults.${status}`)}</span>
          </p>
          {showFailureDetails && failure ? (
            <FailureDetails
              failure={failure}
              screenshot={screenshot}
              durationMs={durationMs}
              browser={browser}
              projectPath={projectPath}
              onOpenScreenshot={() => setShowModal(true)}
            />
          ) : (
            <>
            {message && <MessageContent message={message} />}
            {backtrace && backtrace.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-neutral-mid uppercase tracking-wide mb-1">Backtrace</p>
                <pre className="text-xs font-mono text-neutral-dk bg-neutral-50 border border-neutral-bdr rounded px-3 py-2 overflow-auto max-h-40 whitespace-pre-wrap break-all">
                  {backtrace.join('\n')}
                </pre>
              </div>
            )}
            </>
          )}

          {video && (
            <details className="mt-3" onClick={(e) => e.stopPropagation()}>
              <summary className="text-xs text-ruby cursor-pointer hover:underline">
                {t('testResults.video')}
              </summary>
              <video
                controls
                preload="metadata"
                src={toMediaUrl(video)}
                data-testid="result-video"
                className="mt-2 w-full max-w-xl rounded border border-neutral-bdr"
              />
            </details>
          )}

          <div className="flex gap-3 mt-2">
            {screenshot && !showFailureDetails && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowModal(true) }}
                className="text-xs text-ruby flex items-center gap-1 hover:underline"
              >
                <FaImage />
                {t('testResults.viewScreenshot')}
              </button>
            )}
            {traceTestId && (
              <Tooltip content={t('tooltips.viewTrace')}>
                <button
                  onClick={handleToggleTrace}
                  disabled={traceLoading}
                  className="text-xs text-ruby flex items-center gap-1 hover:underline disabled:opacity-50"
                >
                  <FaRoute />
                  {traceLoading
                    ? 'Loading...'
                    : showTrace
                      ? t('recorder.recorderPage.traceViewExit')
                      : t('testResults.viewTrace')}
                </button>
              </Tooltip>
            )}
          </div>

          {/* Inline trace panel */}
          {showTrace && traceSteps.length > 0 && (
            <div className="mt-3 border border-neutral-bdr rounded-lg overflow-hidden" style={{ height: 380 }}>
              <div className="flex h-full">
                <div className="w-[30%] border-r border-neutral-bdr overflow-y-auto">
                  <TraceTimeline
                    steps={traceSteps}
                    selectedStepId={selectedTraceStepId}
                    onSelectStep={setSelectedTraceStepId}
                  />
                </div>
                <div className="w-[70%] overflow-y-auto">
                  <TraceDetailPanel
                    step={traceSteps.find((s) => s.id === selectedTraceStepId) || null}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showModal && imageData && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <button
            onClick={() => setShowModal(false)}
            className="absolute top-4 right-4 text-white text-2xl"
          >
            <FaTimes />
          </button>
          <div className="relative">
            <img
              src={imageData}
              alt="Screenshot"
              className="max-w-full max-h-full"
              onError={(e) => console.error('Error loading image:', e)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default TestResultCard
