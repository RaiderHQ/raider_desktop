import React from 'react'
import { Link } from 'react-router-dom'
import QuestionIcon from '@assets/icons/Question_vector.svg'
import Button from '@components/Button'

interface ProjectSelectorProps {
  icon: string
  description: string
  url: string
  buttonValue: string
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  icon,
  description,
  url,
  buttonValue
}): JSX.Element => {
  return (
    <div className="relative flex flex-col items-center justify-center">
      <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
      <div className="relative flex flex-col items-center justify-center border border-black p-8 rounded-lg bg-white z-10">
        <div className="absolute top-2 right-2">
          <img src={QuestionIcon} className="w-4 h-auto" />
        </div>
        <div className="mb-4">
          <img src={icon} className="w-12 h-auto" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-6">{description}</h2>
        <Link to={url}>
          <Button>{buttonValue}</Button>
        </Link>
      </div>
    </div>
  )
}

export default ProjectSelector
