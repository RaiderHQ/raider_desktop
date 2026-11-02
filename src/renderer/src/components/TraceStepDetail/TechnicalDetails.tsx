import React, { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RaiderTraceStep } from '@shared/types/raiderTrace'

interface TechnicalDetailsProps {
  step: RaiderTraceStep
}

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-xs font-semibold text-neutral-mid">{label}</dt>
    <dd className="text-sm text-neutral-dk break-all">{children}</dd>
  </div>
)

// The raw step, for whoever needs it. The panel mounts only when open, so none
// of this is in the page until asked for. A secret step's value is never shown,
// and its error message (which may echo the secret) only appears here.
const TechnicalDetails: React.FC<TechnicalDetailsProps> = ({ step }) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const { locator, source, error } = step

  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="text-xs font-semibold text-neutral-mid hover:text-neutral-dk"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> {t('traceViewer.technical.show')}
      </button>
      {open && (
        <dl id={panelId} className="mt-2 space-y-2">
          <Row label={t('traceViewer.technical.action')}>{step.action}</Row>
          {locator && (
            <Row label={t('traceViewer.technical.locator')}>
              {`${locator.strategy}: ${locator.selector}`}
            </Row>
          )}
          {locator && locator.within.length > 0 && (
            <Row label={t('traceViewer.technical.within')}>
              {locator.within.map((outer, i) => (
                <span key={i} className="block">{`${outer.strategy}: ${outer.selector}`}</span>
              ))}
            </Row>
          )}
          {step.secret ? (
            <Row label={t('traceViewer.technical.value')}>{t('traceViewer.technical.hidden')}</Row>
          ) : (
            step.value !== null && <Row label={t('traceViewer.technical.value')}>{step.value}</Row>
          )}
          {source && (
            <Row label={t('traceViewer.technical.source')}>{`${source.file}:${source.line}`}</Row>
          )}
          {error && (
            <Row label={t('traceViewer.technical.error')}>
              <span className="block">{error.className}</span>
              <pre className="text-xs bg-neutral-lt p-2 rounded border border-neutral-bdr overflow-x-auto whitespace-pre-wrap">
                {error.message}
              </pre>
            </Row>
          )}
        </dl>
      )}
    </div>
  )
}

export default TechnicalDetails
