import React, { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { imageDataUrl } from '@foundation/imageDataUrl'
import type { ScreenshotComparison as Comparison } from '@foundation/Types/testResult'

interface ScreenshotComparisonProps {
  comparisons: Comparison[]
}

type Tab = 'expected' | 'actual' | 'diff'
const TAB_ORDER: Tab[] = ['expected', 'actual', 'diff']

/** One picture, read when it is first shown. A change of path or an unmount drops a late answer. */
const ComparisonImage: React.FC<{ path: string; alt: string }> = ({ path, alt }) => {
  const { t } = useTranslation()
  const [src, setSrc] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let active = true
    setSrc(undefined)
    window.api
      .readImage(path)
      .then((res) => {
        if (active) setSrc(res.success ? imageDataUrl(res) : null)
      })
      .catch(() => {
        if (active) setSrc(null)
      })
    return (): void => {
      active = false
    }
  }, [path])

  if (src === null) {
    return <p className="text-xs text-neutral-mid">{t('screenshotComparison.imageUnavailable')}</p>
  }
  if (src === undefined) return <div className="h-24" aria-hidden="true" />
  return <img src={src} alt={alt} className="max-w-full rounded border border-neutral-bdr" />
}

const percent = (ratio: number): string => `${(ratio * 100).toFixed(2)}%`

const ComparisonEntry: React.FC<{ comparison: Comparison }> = ({ comparison: c }) => {
  const { t } = useTranslation()
  const baseId = useId()
  const tabs = TAB_ORDER.filter((tab) => !!c.images[tab])
  const [chosen, setChosen] = useState<Tab | null>(null)
  const selected: Tab | null =
    chosen && tabs.includes(chosen) ? chosen : c.images.diff ? 'diff' : (tabs[0] ?? null)

  const sizeChanged =
    !!c.expectedSize &&
    !!c.actualSize &&
    (c.expectedSize[0] !== c.actualSize[0] || c.expectedSize[1] !== c.actualSize[1])

  let allowed: string | null = null
  if (c.maxDiffRatio !== null) allowed = percent(c.maxDiffRatio)
  else if (c.maxDiffPixels !== null) {
    allowed = t('screenshotComparison.allowedPixels', { n: c.maxDiffPixels.toLocaleString() })
  }
  const allowanceParts = [
    allowed !== null ? t('screenshotComparison.allowed', { allowed }) : null,
    c.threshold !== null ? t('screenshotComparison.threshold', { threshold: c.threshold }) : null
  ].filter(Boolean)

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (!selected || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return
    const step = e.key === 'ArrowRight' ? 1 : -1
    setChosen(tabs[(tabs.indexOf(selected) + step + tabs.length) % tabs.length])
  }

  return (
    <li data-testid={`comparison-${c.name}`} className="space-y-2">
      {/* Task 5: a per-entry action (Accept as baseline) goes in this row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-medium text-neutral-dark truncate">{c.name}</span>
          <span className="text-xs text-neutral-mid">
            {t(`screenshotComparison.status.${c.status}`)}
          </span>
        </div>
      </div>
      {c.diffPixels !== null && (
        <p className="text-xs text-neutral-dk">
          {t('screenshotComparison.differ', {
            pixels: c.diffPixels.toLocaleString(),
            percent: percent(c.diffRatio ?? 0)
          })}
        </p>
      )}
      {c.diffPixels !== null && allowanceParts.length > 0 && (
        <p className="text-xs text-neutral-mid">{allowanceParts.join(' · ')}</p>
      )}
      {sizeChanged && c.expectedSize && c.actualSize && (
        <p className="text-xs text-neutral-mid">
          {t('screenshotComparison.sizeChanged', {
            ew: c.expectedSize[0],
            eh: c.expectedSize[1],
            aw: c.actualSize[0],
            ah: c.actualSize[1]
          })}
        </p>
      )}
      {selected && (
        <div>
          <div role="tablist" className="flex gap-1 mb-2" onKeyDown={onKeyDown}>
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${baseId}-tab-${tab}`}
                aria-selected={tab === selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={tab === selected ? 0 : -1}
                onClick={() => setChosen(tab)}
                className={`text-xs px-2.5 py-1 rounded border font-medium ${
                  tab === selected
                    ? 'border-ruby text-ruby bg-white'
                    : 'border-neutral-bdr bg-white hover:bg-neutral-50'
                }`}
              >
                {t(`screenshotComparison.tabs.${tab}`)}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${selected}`}>
            <ComparisonImage
              key={c.images[selected]}
              path={c.images[selected] as string}
              alt={t('screenshotComparison.imageAlt', {
                tab: t(`screenshotComparison.tabs.${selected}`),
                name: c.name
              })}
            />
          </div>
        </div>
      )}
    </li>
  )
}

/** What a run's screenshot comparisons found: the pictures and numbers of each that changed, one line for those that matched. */
const ScreenshotComparison: React.FC<ScreenshotComparisonProps> = ({ comparisons }) => {
  const { t } = useTranslation()
  const matched = comparisons.filter((c) => c.status === 'passed')
  const shown = comparisons.filter((c) => c.status !== 'passed')
  if (comparisons.length === 0) return null

  return (
    <section data-testid="screenshot-comparison" className="mt-3 space-y-3">
      <h3 className="text-xs font-semibold text-neutral-mid uppercase tracking-wide">
        {t('screenshotComparison.title')}
      </h3>
      {shown.length > 0 && (
        <ul className="space-y-4">
          {shown.map((c, i) => (
            <ComparisonEntry key={`${c.name}-${i}`} comparison={c} />
          ))}
        </ul>
      )}
      {matched.length > 0 && (
        <p className="text-xs text-neutral-mid">
          {t('screenshotComparison.matched', { count: matched.length })}
        </p>
      )}
    </section>
  )
}

export default ScreenshotComparison
