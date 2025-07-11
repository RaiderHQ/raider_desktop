import React from 'react'
import { FaFileAlt } from 'react-icons/fa'

interface FileProps {
  name: string
  path: string
  onFileClick: (filePath: string) => void
}

const File: React.FC<FileProps> = ({ name, path, onFileClick }) => {
  return (
    <div
      className="flex items-center px-4 py-2 border-b cursor-pointer hover:bg-gray-100 hover:text-blue-600"
      onClick={() => onFileClick(path)} // Trigger the onFileClick callback
    >
      <FaFileAlt className="mr-2 text-gray-600" />
      <span>{name}</span>
    </div>
  )
}

export default File
