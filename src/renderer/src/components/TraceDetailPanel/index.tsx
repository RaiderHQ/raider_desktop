import React, { useEffect, useState } from 'react'
import type { TraceStep } from '@foundation/Types/traceStep'
import { useTranslation } from 'react-i18next'

interface TraceDetailPanelProps {
  step: TraceStep | null
}

const TraceDetailPanel: React.FC<TraceDetailPanelProps> = ({ step }): JSX.Element => {
  const { t } = useTranslation()
  const [screenshotSrc, setScreenshotSrc] = useState<string | null>(null)

  useEffect(() => {
    setScreenshotSrc(null)
    if (step?.screenshotPath) {
      window.api.readImage(step.screenshotPath).then((result) => {
        if (result.success && result.data) {
          setScreenshotSrc(`data:image/${result.fileExt || 'jpeg'};base64,${result.data}`)
        }
      })
    }
  }, [step?.id])

  if (!step) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-mid text-sm p-4">
        Select a step to view details
      </div>
    )
  }

  const timestamp = new Date(step.timestamp)

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 space-y-4">
      {/* Screenshot */}
      {screenshotSrc ? (
        <img
          src={screenshotSrc}
          alt="Step screenshot"
          className="w-full rounded-lg border border-neutral-bdr shadow-sm"
        />
      ) : step.screenshotPath ? (
        <div className="w-full h-48 bg-neutral-lt rounded-lg flex items-center justify-center text-sm text-neutral-mid">
          Loading screenshot...
        </div>
      ) : null}

      {/* Command */}
      <div>
        <h4 className="text-xs font-semibold text-neutral-mid uppercase mb-1">
          {t('recorder.traceDetail.command')}
        </h4>
        <pre className="text-sm bg-neutral-lt p-2 rounded border border-neutral-bdr overflow-x-auto whitespace-pre-wrap">
          {step.command}
        </pre>
      </div>

      {/* Page URL */}
      {step.url && (
        <div>
          <h4 className="text-xs font-semibold text-neutral-mid uppercase mb-1">
            {t('recorder.traceDetail.pageUrl')}
          </h4>
          <p className="text-sm text-neutral-dk break-all">{step.url}</p>
        </div>
      )}

      {/* Timestamp */}
      <div>
        <h4 className="text-xs font-semibold text-neutral-mid uppercase mb-1">
          {t('recorder.traceDetail.timestamp')}
        </h4>
        <p className="text-sm text-neutral-dk">
          {timestamp.toLocaleTimeString()} ({timestamp.toLocaleDateString()})
        </p>
      </div>

      {/* Element Info */}
      {step.elementInfo && (
        <div>
          <h4 className="text-xs font-semibold text-neutral-mid uppercase mb-1">
            {t('recorder.traceDetail.elementInfo')}
          </h4>
          <div className="text-sm bg-neutral-lt p-2 rounded border border-neutral-bdr space-y-1">
            <p>
              <span className="font-medium text-neutral-dk">Tag:</span>{' '}
              <code className="text-ruby">&lt;{step.elementInfo.tagName.toLowerCase()}&gt;</code>
            </p>
            <p>
              <span className="font-medium text-neutral-dk">Strategy:</span>{' '}
              {step.elementInfo.strategy}
            </p>
            <p className="break-all">
              <span className="font-medium text-neutral-dk">Selector:</span>{' '}
              <code className="text-xs">{step.elementInfo.selector}</code>
            </p>
            {step.elementInfo.innerText && (
              <p className="break-all">
                <span className="font-medium text-neutral-dk">Text:</span>{' '}
                {step.elementInfo.innerText}
              </p>
            )}
            {step.elementInfo.boundingRect && (
              <p>
                <span className="font-medium text-neutral-dk">Position:</span>{' '}
                {Math.round(step.elementInfo.boundingRect.x)},{' '}
                {Math.round(step.elementInfo.boundingRect.y)} ({step.elementInfo.boundingRect.width}
                x{step.elementInfo.boundingRect.height})
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TraceDetailPanel
