import React, { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { plainUrl } from '@shared/trace/describeTraceStep'
import type { RaiderTraceConsole, RaiderTraceNetwork } from '@shared/types/raiderTrace'

interface ListProps<T> {
  items: T[] // already filtered (see eventsForStep); entries with no step come only with all
  available: boolean // false when the browser couldn't record them
  all: boolean
}

const KB = 1024
const MB = 1024 * 1024

/** A size in B, KB or MB; empty when unknown. */
export function formatBytes(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n < 0) return ''
  if (n < KB) return `${Math.round(n)} B`
  if (n < MB) return `${(n / KB).toFixed(1)} KB`
  return `${(n / MB).toFixed(1)} MB`
}

const MAX_CONSOLE_CHARS = 300
const URL_IN_TEXT = /https?:\/\/[^\s"'<>()]+/gi

/**
 * Console text for the plain view: every address reduced to origin and path
 * (no query, fragment or credentials), cut to 300 characters.
 */
export function plainConsoleText(text: string): string {
  const plain = text.replace(URL_IN_TEXT, (url) => plainUrl(url))
  return plain.length > MAX_CONSOLE_CHARS ? `${plain.slice(0, MAX_CONSOLE_CHARS)}…` : plain
}

const LEVELS: Record<string, string> = {
  log: 'log',
  info: 'info',
  warn: 'warning',
  warning: 'warning',
  error: 'error',
  debug: 'debug'
}

const levelKey = (level: string): string =>
  `traceViewer.console.level.${Object.hasOwn(LEVELS, level) ? LEVELS[level] : 'other'}`

const Message: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center justify-center p-4 text-sm text-neutral-mid">{children}</div>
)

// A row's raw fields, mounted only when open.
const RowDetails: React.FC<{ label: string; rows: [string, string][] }> = ({ label, rows }) => {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="text-xs text-neutral-mid hover:text-neutral-dk"
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span> {label}
      </button>
      {open && (
        <dl id={panelId} className="mt-1 space-y-1">
          {rows.map(([name, value]) => (
            <div key={name} className="flex gap-2 text-xs">
              <dt className="font-semibold text-neutral-mid shrink-0">{name}</dt>
              <dd className="text-neutral-dk break-all">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

// The plain row shows the address without its query string, fragment or
// credentials, and a failure as just "Failed"; the raw values sit in the details.
export const TraceNetworkList: React.FC<ListProps<RaiderTraceNetwork>> = ({
  items,
  available,
  all
}) => {
  const { t } = useTranslation()
  const hintId = useId()
  if (!available) return <Message>{t('traceViewer.unavailable')}</Message>
  if (items.length === 0) {
    return (
      <Message>{t(all ? 'traceViewer.network.emptyAll' : 'traceViewer.network.empty')}</Message>
    )
  }
  return (
    <div>
      <ul className="divide-y divide-neutral-lt">
        {items.map((item, i) => {
          const failed = item.error !== null
          const rows: [string, string][] = [[t('traceViewer.technical.url'), item.url]]
          if (item.mimeType) rows.push([t('traceViewer.technical.type'), item.mimeType])
          if (item.error) rows.push([t('traceViewer.technical.error'), item.error])
          return (
            <li key={i} className="py-2 space-y-1">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-semibold text-neutral-dk">{item.method}</span>
                <span className="flex-1 min-w-0 truncate text-neutral-dk">
                  {plainUrl(item.url)}
                </span>
                <span
                  className={
                    failed || (item.status !== null && item.status >= 400)
                      ? 'text-status-err'
                      : 'text-neutral-mid'
                  }
                >
                  {failed ? t('traceViewer.network.failed') : (item.status ?? '')}
                </span>
                {item.durationMs !== null && (
                  <span className="text-neutral-mid">{`${Math.round(item.durationMs)} ms`}</span>
                )}
                {item.bytes !== null && (
                  <span className="text-neutral-mid" aria-describedby={hintId}>
                    {formatBytes(item.bytes)}
                  </span>
                )}
              </div>
              <RowDetails label={t('traceViewer.network.details')} rows={rows} />
            </li>
          )
        })}
      </ul>
      <p id={hintId} className="pt-2 text-xs text-neutral-mid">
        {t('traceViewer.network.size')}
      </p>
    </div>
  )
}

export const TraceConsoleList: React.FC<ListProps<RaiderTraceConsole>> = ({
  items,
  available,
  all
}) => {
  const { t } = useTranslation()
  if (!available) return <Message>{t('traceViewer.unavailable')}</Message>
  if (items.length === 0) {
    return (
      <Message>{t(all ? 'traceViewer.console.emptyAll' : 'traceViewer.console.empty')}</Message>
    )
  }
  return (
    <ul className="divide-y divide-neutral-lt">
      {items.map((item, i) => (
        <li key={i} className="py-2 space-y-1">
          <div className="flex items-baseline gap-2 text-sm">
            <span
              className={`text-xs font-semibold ${
                item.level === 'error' ? 'text-status-err' : 'text-neutral-mid'
              }`}
            >
              {t(levelKey(item.level))}
            </span>
            <span className="flex-1 min-w-0 text-neutral-dk whitespace-pre-wrap break-words">
              {plainConsoleText(item.text)}
            </span>
          </div>
          <RowDetails
            label={t('traceViewer.console.details')}
            rows={[
              [t('traceViewer.console.text'), item.text],
              ...(item.source
                ? [[t('traceViewer.technical.source'), item.source] as [string, string]]
                : [])
            ]}
          />
        </li>
      ))}
    </ul>
  )
}
