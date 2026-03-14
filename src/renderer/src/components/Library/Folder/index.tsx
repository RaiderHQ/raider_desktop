import React, { useState } from 'react'
import { FaFolder, FaChevronDown, FaChevronRight, FaPlay } from 'react-icons/fa'
import File from '@components/Library/File'
import { FileNode } from '@foundation/Types/fileNode'

interface FolderProps {
  name?: string
  path?: string
  files?: FileNode[]
  defaultOpen?: boolean
  onFileClick: (filePath: string) => void
  isRoot?: boolean
  onRunTests?: () => void
  onGenerateSpec?: (filePath: string, pageName: string) => void
  onFileContextMenu?: (e: React.MouseEvent, filePath: string, fileName: string) => void
  onFolderContextMenu?: (e: React.MouseEvent, folderPath: string, folderName: string) => void
}

const Folder: React.FC<FolderProps> = ({
  name,
  path: folderPath,
  files,
  defaultOpen = false,
  onFileClick,
  isRoot = false,
  onRunTests,
  onGenerateSpec,
  onFileContextMenu,
  onFolderContextMenu
}) => {
  // If root, force the folder to always be open.
  const [isOpen, setOpen] = useState(isRoot ? true : defaultOpen)

  const handleToggle = (): void => {
    if (!isRoot) {
      setOpen(!isOpen)
    }
  }

  const handleFolderContextMenu = (e: React.MouseEvent): void => {
    if (isRoot || !onFolderContextMenu || !folderPath || !name) return
    e.preventDefault()
    onFolderContextMenu(e, folderPath, name)
  }

  return (
    <>
      <div
        className="flex items-center w-full px-4 py-2 bg-neutral-lt border-b focus:outline-none"
        onContextMenu={handleFolderContextMenu}
      >
        {!isRoot && (
          <button onClick={handleToggle} className="mr-2 focus:outline-none">
            {isOpen ? <FaChevronDown /> : <FaChevronRight />}
          </button>
        )}
        <FaFolder className="ml-2 mr-2" />
        <span className="font-semibold flex-grow">{name}</span>
        {isRoot && onRunTests && (
          <button onClick={onRunTests} className="ml-auto focus:outline-none">
            <FaPlay className="text-status-ok hover:text-status-ok" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="pl-8">
          {files && files.length > 0 ? (
            [...files].sort((a, b) => {
              if (a.type === 'folder' && b.type !== 'folder') return -1
              if (a.type !== 'folder' && b.type === 'folder') return 1
              return 0
            }).map((file, key) => {
              if (file.type === 'folder') {
                return (
                  <Folder
                    key={key}
                    name={file.name}
                    path={file.path}
                    files={file.children}
                    onFileClick={onFileClick}
                    onGenerateSpec={onGenerateSpec}
                    onFileContextMenu={onFileContextMenu}
                    onFolderContextMenu={onFolderContextMenu}
                  />
                )
              }
              return (
                <File
                  key={key}
                  name={file.name}
                  path={file.path}
                  onFileClick={onFileClick}
                  onGenerateSpec={onGenerateSpec}
                  onContextMenu={onFileContextMenu}
                />
              )
            })
          ) : (
            <p className="text-sm text-neutral-mid italic py-2 px-2">Empty folder</p>
          )}
        </div>
      )}
    </>
  )
}

export default Folder
