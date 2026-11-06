import React from 'react'
import { FaFileAlt } from 'react-icons/fa'
import { useTranslation } from 'react-i18next'
import Tooltip from '@components/Tooltip'

interface FileProps {
  name: string
  path: string
  onFileClick: (filePath: string) => void
  onContextMenu?: (e: React.MouseEvent, filePath: string, fileName: string) => void
}

const File: React.FC<FileProps> = ({ name, path, onFileClick, onContextMenu }) => {
  const { t } = useTranslation()
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()

    onContextMenu?.(e, path, name)
  }

  return (
    <Tooltip content={t('tooltips.files.treeRow')} position="right" className="w-full">
      <div
        className="flex items-center w-full px-2 py-1.5 border-b cursor-pointer hover:bg-neutral-lt hover:text-ruby"
        onClick={() => onFileClick(path)}
        onContextMenu={handleContextMenu}
      >
        <FaFileAlt className="mr-2 text-neutral-dk" />
        <span>{name}</span>
      </div>
    </Tooltip>
  )
}

export default File
