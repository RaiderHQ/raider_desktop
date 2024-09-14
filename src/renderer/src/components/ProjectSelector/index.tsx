import React from 'react'
import { Link } from 'react-router-dom'

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
    <div className="flex flex-col items-center justify-center border-2 border-gray-300 p-8 rounded-lg shadow-lg">
      <div className="mb-4">
        <img src={icon} className="w-12 h-auto" />
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-6">{description}</h2>
      <Link to={url} className="px-4 py-2 bg-gray-300 text-blue-500 rounded-lg shadow">
        {buttonValue}
      </Link>
    </div>
  )
}

export default ProjectSelector
