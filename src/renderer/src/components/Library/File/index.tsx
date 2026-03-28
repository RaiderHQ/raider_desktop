import React from 'react'
import { FaFileAlt } from 'react-icons/fa'

interface FileProps {
  name: string
  path: string
  onFileClick: (filePath: string) => void
  onGenerateSpec?: (filePath: string, pageName: string) => void
  onContextMenu?: (e: React.MouseEvent, filePath: string, fileName: string) => void
}

const File: React.FC<FileProps> = ({ name, path, onFileClick, onGenerateSpec, onContextMenu }) => {
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()

    if (onContextMenu) {
      onContextMenu(e, path, name)
      return
    }

    // Legacy: generate spec for page files
    const isPageFile =
      (name.endsWith('_page.rb') || path.includes('/pages/')) && name.endsWith('.rb')
    if (!isPageFile || !onGenerateSpec) return

    const pageName = name
      .replace(/_page\.rb$/, '')
      .replace(/\.rb$/, '')
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join('')

    onGenerateSpec(path, pageName)
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
