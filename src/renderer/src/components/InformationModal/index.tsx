import React, { useState } from 'react'
import ReactDOM from 'react-dom'
import Logo from '@components/Logo'
import { useTranslation } from 'react-i18next'

interface CollapsibleSection {
  titleKey: string
  contentKey: string
}

interface ModalProps {
  title: string
  message: string
  onClose: () => void
  collapsibleSections?: CollapsibleSection[]
}

const InformationModal: React.FC<ModalProps> = ({
  title,
  message,
  onClose,
  collapsibleSections
}): JSX.Element => {
  const { t } = useTranslation()
  const [openSection, setOpenSection] = useState<number | null>(null)

  const handleOutsideClick = (e: React.MouseEvent): void => {
    if ((e.target as HTMLElement).id === 'modal-overlay') {
      onClose()
    }
  }

  const toggleSection = (index: number): void => {
    setOpenSection(openSection === index ? null : index)
  }

  return ReactDOM.createPortal(
    <div
      id="modal-overlay"
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleOutsideClick}
    >
      <div
        className="bg-white rounded-xl shadow-elevated max-w-lg w-full flex flex-col max-h-[85vh] relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-neutral-bdr px-6 py-4 shrink-0">
          <Logo size={28} />
          <h2 className="text-lg font-semibold text-neutral-dark">{title}</h2>
          <button
            className="ml-auto text-neutral-mid hover:text-neutral-dark transition-colors"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 overflow-y-auto">
          <p className="text-neutral-dk whitespace-pre-wrap text-sm">{message}</p>

          {collapsibleSections && collapsibleSections.length > 0 && (
            <div className="mt-4 space-y-2">
              {collapsibleSections.map((section, index) => (
                <div key={index} className="border border-neutral-bdr rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleSection(index)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-neutral-dark hover:bg-neutral-50 transition-colors"
                  >
                    {t(section.titleKey)}
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className={`transition-transform duration-200 ${openSection === index ? 'rotate-180' : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {openSection === index && (
                    <div className="px-4 pb-3 text-sm text-neutral-dk whitespace-pre-wrap border-t border-neutral-bdr pt-3">
                      {t(section.contentKey)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>,
    document.getElementById('root')!
  )
}

export default InformationModal
