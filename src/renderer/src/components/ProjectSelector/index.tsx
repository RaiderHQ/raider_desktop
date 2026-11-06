import React, { useState } from 'react'
import { Link } from 'react-router'
import Button from '@components/Button'
import InformationModal from '@components/InformationModal'
import Tooltip from '@components/Tooltip'
import { useTranslation } from 'react-i18next'
import type { ShortcutId } from '@shared/shortcuts'

interface ProjectSelectorProps {
  icon: string
  description: string
  url?: string
  buttonValue: string
  onClick?: () => void
  modalTitleKey: string
  modalMessageKey: string
  /** Shown on the card's button and its help button */
  tooltip?: string
  /** Chip on the card's button tooltip */
  shortcut?: ShortcutId
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  icon,
  description,
  url,
  buttonValue,
  onClick,
  modalTitleKey,
  modalMessageKey,
  tooltip,
  shortcut
}): JSX.Element => {
  const [isModalOpen, setModalOpen] = useState(false)
  const { t } = useTranslation()

  const withTooltip = (node: React.ReactElement, chip?: ShortcutId): React.ReactElement =>
    tooltip ? (
      <Tooltip content={tooltip} shortcut={chip} position="bottom">
        {node}
      </Tooltip>
    ) : (
      node
    )

  return (
    <div className="relative flex flex-col items-center justify-center w-full">
      <div className="relative flex flex-col items-center justify-center w-full border border-neutral-bdr p-8 rounded-lg bg-white shadow-card hover:shadow-card-hover transition-shadow duration-200">
        <div className="absolute top-2 right-2">
          {withTooltip(
            <button
              className="w-7 h-7 flex items-center justify-center rounded-full text-neutral-md hover:text-ruby hover:bg-ruby-sub transition-colors"
              onClick={() => setModalOpen(true)}
              aria-label="Help"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
          )}
        </div>
        <div className="mb-4 w-14 h-14 bg-ruby-sub rounded-full flex items-center justify-center">
          <img src={icon} className="w-8 h-8" />
        </div>
        <h2 className="text-[1.35rem] font-semibold text-neutral-dark mb-6">{description}</h2>
        {url ? (
          <Link to={url}>{withTooltip(<Button>{buttonValue}</Button>, shortcut)}</Link>
        ) : (
          withTooltip(<Button onClick={onClick}>{buttonValue}</Button>, shortcut)
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
