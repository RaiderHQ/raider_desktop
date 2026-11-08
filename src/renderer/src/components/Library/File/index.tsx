import React from 'react'
import { FaFileAlt } from 'react-icons/fa'
import { useTranslation } from 'react-i18next'
import Tooltip from '@components/Tooltip'
import { samePath } from '@foundation/projectFilePaths'

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
  // The open file's path may use / where the tree's uses \\ (Windows)
  const dirty = dirtyPath !== undefined && samePath(path, dirtyPath)
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()

    onContextMenu?.(e, path, name)
  }

  return (
    <Tooltip content={t('tooltips.files.treeRow')} position="right" className="w-full">
      <div
        className="flex items-center w-full px-2 py-1.5 border-b cursor-pointer hover:bg-neutral-lt hover:text-ruby"
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
    </Tooltip>
  )
}

export default File
