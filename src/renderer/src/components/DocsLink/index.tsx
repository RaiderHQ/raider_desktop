import React from 'react'
import { useTranslation } from 'react-i18next'
import type { DocsLinkId } from '@shared/docsLinkIds'

interface DocsLinkProps {
  id: DocsLinkId
  /** What the page is about, for the accessible name */
  topic: string
  children?: React.ReactNode
  className?: string
}

/** Opens a page of the documentation in the browser; the main process owns the URL. */
const DocsLink: React.FC<DocsLinkProps> = ({ id, topic, children, className = '' }) => {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      aria-label={t('docs.learnMoreAbout', { topic })}
      className={`text-ruby hover:underline text-sm ${className}`.trim()}
      onClick={() => {
        void window.api.openDocs(id)
      }}
    >
      {children ?? t('docs.learnMore')}
    </button>
  )
}

export default DocsLink
