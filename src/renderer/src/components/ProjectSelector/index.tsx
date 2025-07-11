import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import QuestionIcon from '@assets/icons/Question_vector.svg'
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
    <div className="relative flex flex-col items-center justify-center">
      <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
      <div className="relative flex flex-col items-center justify-center border border-black p-8 rounded-lg bg-white z-10">
        <div className="absolute top-2 right-2">
          <img
            src={QuestionIcon}
            className="w-[1.8rem] h-[1.8rem] cursor-pointer"
            onClick={() => setModalOpen(true)}
            alt="Help"
          />
        </div>
        <div className="mb-4">
          <img src={icon} className="w-[3.2rem] h-[3.2rem]" />
        </div>
        <h2 className="text-[1.35rem] font-semibold text-gray-900 mb-6">{description}</h2>
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
