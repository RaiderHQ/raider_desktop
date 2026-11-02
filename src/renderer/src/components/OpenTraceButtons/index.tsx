import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FaRoute } from 'react-icons/fa'
import { useTraceOpener } from '@foundation/trace/useTraceOpener'
import type { TraceRef } from '@foundation/Types/testResult'

interface OpenTraceButtonsProps {
  traces: TraceRef[] // latest attempt first
}

// One "Open trace" per saved trace: by attempt when each has one, else numbered.
const OpenTraceButtons: React.FC<OpenTraceButtonsProps> = ({ traces }) => {
  const { t } = useTranslation()
  const { openTrace, opening } = useTraceOpener()
  const [pending, setPending] = useState<string | null>(null)
  const byAttempt = traces.every((trace) => trace.attempt !== undefined)

  const label = (trace: TraceRef, i: number): string => {
    if (opening && pending === trace.path) return t('traceViewer.opening')
    if (traces.length === 1) return t('traceViewer.open')
    return byAttempt
      ? t('traceViewer.openAttempt', { attempt: String(trace.attempt) })
      : t('traceViewer.openNumbered', { n: String(i + 1) })
  }

  return (
    <>
      {traces.map((trace, i) => (
        <button
          key={trace.path}
          type="button"
          disabled={opening}
          onClick={(e) => {
            e.stopPropagation()
            setPending(trace.path)
            void openTrace({ kind: 'result', path: trace.path })
          }}
          className="text-xs text-ruby flex items-center gap-1 hover:underline disabled:opacity-50"
        >
          <FaRoute />
          {label(trace, i)}
        </button>
      ))}
    </>
  )
}

export default OpenTraceButtons
