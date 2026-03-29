import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import InformationModal from '@components/InformationModal'

interface CollapsibleSection {
  titleKey: string
  contentKey: string
}

interface InfoButtonProps {
  titleKey: string
  messageKey: string
  className?: string
  collapsibleSections?: CollapsibleSection[]
}

const InfoButton: React.FC<InfoButtonProps> = ({
  titleKey,
  messageKey,
  className = '',
  collapsibleSections
}) => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Help information"
        className={`w-7 h-7 flex items-center justify-center rounded-full text-neutral-mid hover:text-ruby hover:bg-ruby-sub transition-colors ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {isOpen && (
        <InformationModal
          title={t(titleKey)}
          message={t(messageKey)}
          onClose={() => setIsOpen(false)}
          collapsibleSections={collapsibleSections}
        />
      )}
    </>
  )
}

export default InfoButton
