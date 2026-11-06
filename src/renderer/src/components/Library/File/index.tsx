import React from 'react'
import { FaFileAlt } from 'react-icons/fa'
import { useTranslation } from 'react-i18next'

interface FileProps {
  name: string
  path: string
  /** The file with unsaved changes, if any */
  dirtyPath?: string
  onFileClick: (filePath: string) => void
  onContextMenu?: (e: React.MouseEvent, filePath: string, fileName: string) => void
}

const File: React.FC<FileProps> = ({ name, path, dirtyPath, onFileClick, onContextMenu }) => {
  const { t } = useTranslation()
  const dirty = dirtyPath !== undefined && path === dirtyPath
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()

    onContextMenu?.(e, path, name)
  }

  return (
    <div
      className="flex items-center px-2 py-1.5 border-b cursor-pointer hover:bg-neutral-lt hover:text-ruby"
      aria-label={dirty ? t('files.unsavedSuffix', { name }) : undefined}
      onClick={() => onFileClick(path)}
      onContextMenu={handleContextMenu}
    >
      <FaFileAlt className="mr-2 text-neutral-dk" />
      {dirty && (
        <span aria-hidden="true" className="text-ruby mr-1">
          •
        </span>
      )}
      <span>{name}</span>
    </div>
  )
}

export default File
