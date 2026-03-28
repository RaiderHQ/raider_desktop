import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '@components/Button'
import InformationModal from '@components/InformationModal'
import { useTranslation } from 'react-i18next'

interface ProjectSelectorProps {
  icon: string
  description: string
  url?: string
  buttonValue: string
  onClick?: () => void
  modalTitleKey: string
  modalMessageKey: string
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  icon,
  description,
  url,
  buttonValue,
  onClick,
  modalTitleKey,
  modalMessageKey
}): JSX.Element => {
  const [isModalOpen, setModalOpen] = useState(false)
  const { t } = useTranslation()

  return (
    <div className="relative flex flex-col items-center justify-center w-full">
      <div className="relative flex flex-col items-center justify-center w-full border border-neutral-bdr p-8 rounded-lg bg-white shadow-card hover:shadow-card-hover transition-shadow duration-200">
        <button
          className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full text-neutral-mid hover:text-ruby hover:bg-ruby-sub transition-colors"
          onClick={() => setModalOpen(true)}
          aria-label="Help"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
        <div className="mb-4 w-14 h-14 bg-ruby-sub rounded-full flex items-center justify-center">
          <img src={icon} className="w-8 h-8" />
        </div>
        <h2 className="text-[1.35rem] font-semibold text-neutral-dark mb-6">{description}</h2>
        {url ? (
          <Link to={url}>
            <Button>{buttonValue}</Button>
          </Link>
        ) : (
          <Button onClick={onClick}>{buttonValue}</Button>
        )}
      </div>

      {isModalOpen && (
        <InformationModal
          title={t(modalTitleKey)}
          onClose={() => setModalOpen(false)}
          message={t(modalMessageKey)}
        />
      )}
    </div>
  )
}

export default ProjectSelector
