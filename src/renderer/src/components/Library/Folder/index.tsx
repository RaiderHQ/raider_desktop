import React, { useState } from 'react'
import { FaFolder, FaChevronDown, FaChevronRight, FaPlay } from 'react-icons/fa'
import File from '@components/Library/File'
import { FileNode } from '@foundation/Types/fileNode'

interface FolderProps {
  name: string
  files?: FileNode[]
  defaultOpen?: boolean
  onFileClick: (filePath: string) => void
  isRoot?: boolean
  onRunTests?: () => void
}

const Folder: React.FC<FolderProps> = ({
  name,
  files,
  defaultOpen = false,
  onFileClick,
  isRoot = false,
  onRunTests
}) => {
  // If root, force the folder to always be open.
  const [isOpen, setOpen] = useState(isRoot ? true : defaultOpen)

  const handleToggle = () => {
    if (!isRoot) {
      setOpen(!isOpen)
    }
  }

  return (
    <>
      <div className="flex items-center w-full px-4 py-2 bg-gray-50 border-b focus:outline-none">
        {/* For non-root folders, display the chevron to toggle open state */}
        {!isRoot && (
          <button onClick={handleToggle} className="mr-2 focus:outline-none">
            {isOpen ? <FaChevronDown /> : <FaChevronRight />}
          </button>
        )}
        <FaFolder className="ml-2 mr-2" />
        <span className="font-semibold flex-grow">{name}</span>
        {/* For root folder, add a play button on the far right */}
        {isRoot && onRunTests && (
          <button onClick={onRunTests} className="ml-auto focus:outline-none">
            <FaPlay className="text-green-600 hover:text-green-800" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="pl-8">
          {files &&
            files.map((file, key) => {
              if (file.type === 'folder') {
                return (
                  <Folder
                    key={key}
                    name={file.name}
                    files={file.children}
                    onFileClick={onFileClick}
                  />
                )
              }
              return <File key={key} name={file.name} path={file.path} onFileClick={onFileClick} />
            })}
        </div>
      )}
    </>
  )
}

export default Folder
