import React from 'react'
import { useTranslation } from 'react-i18next'

export type CodeView = 'steps' | 'ruby'

interface CodeViewToggleProps {
  view: CodeView
  onChange: (view: CodeView) => void
  /** Why the steps view can't be chosen; the segment stays visible and says so */
  stepsUnavailableReason?: string
}

const segment =
  'text-xs px-2.5 py-1 border border-neutral-bdr font-medium transition-colors bg-white text-neutral-dk hover:bg-neutral-50 aria-pressed:bg-neutral-lt aria-disabled:text-neutral-mid aria-disabled:cursor-not-allowed aria-disabled:hover:bg-white'

/** "Steps | Ruby": the two ways to look at a test, as one two-segment control. */
const CodeViewToggle: React.FC<CodeViewToggleProps> = ({
  view,
  onChange,
  stepsUnavailableReason
}) => {
  const { t } = useTranslation()
  const stepsUnavailable = !!stepsUnavailableReason

  return (
    <div role="group" aria-label={t('testPage.view')} className="inline-flex">
      <button
        type="button"
        aria-pressed={view === 'steps'}
        aria-disabled={stepsUnavailable || undefined}
        title={stepsUnavailableReason}
        onClick={() => !stepsUnavailable && onChange('steps')}
        className={`${segment} rounded-l`}
      >
        {t('testPage.steps')}
      </button>
      <button
        type="button"
        aria-pressed={view === 'ruby'}
        onClick={() => onChange('ruby')}
        className={`${segment} rounded-r -ml-px`}
      >
        {t('testPage.ruby')}
      </button>
    </div>
  )
}

export default CodeViewToggle
