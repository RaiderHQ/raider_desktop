import React from 'react'
import { useNavigate } from 'react-router-dom'
import { FaFileAlt } from 'react-icons/fa'
import useProjectStore from '@foundation/Stores/projectStore'
import { FileNode } from '@foundation/Types/fileNode'

const File: React.FC<FileNode> = ({ name, path }) => {
  const navigate = useNavigate()
  const toggleFile: (path: string) => void = useProjectStore(
    (state: { toggleFile: (path: string) => void }) => state.toggleFile
  )
  const selectedFiles: string[] = useProjectStore(
    (state: { selectedFiles: string[] }) => state.selectedFiles
  )
  const isSelected = selectedFiles.includes(path)

  return (
    <div
      className="flex items-center px-4 py-2 border-b cursor-pointer hover:bg-gray-100 hover:text-blue-600"
      onClick={() => navigate('/project/editor', { state: { fileName: name, path } })}
    >
      <input
        type="checkbox"
        className="mr-2 w-4 h-4 cursor-pointer"
        checked={isSelected}
        onChange={() => toggleFile(path)}
        onClick={(e) => e.stopPropagation()}
      />
      <FaFileAlt className="mr-2 text-gray-600" />
      <span>{name}</span>
    </div>
  )
}

export default File
