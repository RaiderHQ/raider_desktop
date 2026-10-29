import React from 'react'
import { FaFileAlt } from 'react-icons/fa'

interface FileProps {
  name: string
  path: string
  onFileClick: (filePath: string) => void
  onContextMenu?: (e: React.MouseEvent, filePath: string, fileName: string) => void
}

const File: React.FC<FileProps> = ({ name, path, onFileClick, onContextMenu }) => {
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()

    onContextMenu?.(e, path, name)
  }

  return (
    <div
      className="flex items-center px-2 py-1.5 border-b cursor-pointer hover:bg-neutral-lt hover:text-ruby"
      onClick={() => onFileClick(path)}
      onContextMenu={handleContextMenu}
    >
      <FaFileAlt className="mr-2 text-neutral-dk" />
      <span>{name}</span>
    </div>
  )
}

export default File
