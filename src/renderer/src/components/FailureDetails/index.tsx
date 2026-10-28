import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { MessageContent } from '@components/TestResultCard/MessageContent'
import { foldFrames, parseFrame } from '@foundation/stackFrames'
import { resolveEditorTarget, type EditorTarget } from '@foundation/openInEditor'
import type { FailureInfo } from '@foundation/Types/testResult'

interface FailureDetailsProps {
  failure: FailureInfo
  screenshot?: string
  durationMs?: number
  browser?: string
  projectPath?: string
  onOpenScreenshot?: () => void
}

const FoldedFrames: React.FC<{ lines: string[] }> = ({ lines }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <div data-testid="stack-frames-folded">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-neutral-mid hover:underline"
      >
        {t('testResults.moreFrames', { count: lines.length })}
      </button>
      {open &&
        lines.map((line, i) => (
          <div key={i} className="text-neutral-mid">
            {line}
          </div>
        ))}
    </div>
  )
}

const FailureDetails: React.FC<FailureDetailsProps> = ({
  failure,
  screenshot,
  durationMs,
  browser,
  projectPath,
  onOpenScreenshot
}) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [target, setTarget] = useState<EditorTarget | null>(null)
  const [traceOpen, setTraceOpen] = useState(false)
  const [thumb, setThumb] = useState('')
  const { appFrame, backtrace } = failure

  useEffect(() => {
    let active = true
    setTarget(null)
    if (appFrame && projectPath) {
      resolveEditorTarget(projectPath, appFrame, window.api).then((resolved) => {
        if (active) setTarget(resolved)
      })
    }
    return (): void => {
      active = false
    }
  }, [appFrame, projectPath])

  useEffect(() => {
    let active = true
    setThumb('')
    if (screenshot) {
      window.api
        .readImage(screenshot)
        .then((res: { success: boolean; data?: string }) => {
          if (active && res.success && res.data) setThumb(`data:image/png;base64,${res.data}`)
        })
        .catch(() => {})
    }
    return (): void => {
      active = false
    }
  }, [screenshot])

  const frame = appFrame ? parseFrame(appFrame) : null
  const locationLabel = frame ? `${frame.file}:${frame.line}` : appFrame
  const segments = foldFrames(backtrace, appFrame)

  const openInEditor = (e: React.MouseEvent): void => {
    e.stopPropagation()
    if (!target) return
    navigate('/file-editor', {
      state: { fileName: target.fileName, filePath: target.filePath, line: target.line }
    })
  }

  return (
    <div data-testid="failure-details" className="mt-2 flex gap-4 items-start">
      {screenshot && thumb && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenScreenshot?.()
          }}
          className="w-[45%] shrink-0"
          aria-label={t('testResults.viewScreenshot')}
        >
          <img
            src={thumb}
            alt={t('testResults.screenshotAlt')}
            className="w-full rounded border border-neutral-bdr"
          />
        </button>
      )}
      <div className="min-w-0 flex-1">
        {failure.exceptionClass && (
          <p className="text-xs font-semibold text-red-600 break-all">{failure.exceptionClass}</p>
        )}
        <MessageContent message={failure.message} />
        {appFrame && (
          <p data-testid="failure-location-row" className="mt-2 text-xs text-neutral-mid">
            {t('testResults.failedAt')}{' '}
            {target ? (
              <button
                type="button"
                data-testid="failure-location"
                title={appFrame}
                onClick={openInEditor}
                className="text-ruby hover:underline"
              >
                {locationLabel}
              </button>
            ) : (
              <span data-testid="failure-location" title={appFrame}>
                {locationLabel}
              </span>
            )}
            {durationMs !== undefined && <span> · {durationMs} ms</span>}
            {browser && <span> · {browser}</span>}
          </p>
        )}
        {!appFrame && (durationMs !== undefined || browser) && (
          <p className="mt-2 text-xs text-neutral-mid">
            {[durationMs !== undefined ? `${durationMs} ms` : null, browser]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}
        {backtrace.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              data-testid="stack-trace-toggle"
              aria-expanded={traceOpen}
              onClick={(e) => {
                e.stopPropagation()
                setTraceOpen(!traceOpen)
              }}
              className="text-xs text-ruby hover:underline"
            >
              {t('testResults.stackTrace')}
            </button>
            {traceOpen && (
              <div className="mt-1 text-xs font-mono bg-neutral-50 border border-neutral-bdr rounded px-3 py-2 overflow-auto max-h-60 break-all">
                {segments.map((segment, i) =>
                  segment.kind === 'project' ? (
                    <div
                      key={i}
                      data-testid="stack-frame-project"
                      className="bg-yellow-100 font-semibold"
                    >
                      {segment.text}
                    </div>
                  ) : (
                    <FoldedFrames key={i} lines={segment.lines} />
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default FailureDetails
