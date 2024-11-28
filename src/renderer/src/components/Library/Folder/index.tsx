import React, { useState } from 'react'
import { FaFolder, FaChevronDown, FaChevronRight } from 'react-icons/fa'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import File from '@components/Library/File'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { FileNode } from '@foundation/Types/fileNode'

interface FolderProps {
  name: string
  files?: FileNode[]
  defaultOpen?: boolean
  onFileClick: (filePath: string) => void
}

const Folder: React.FC<FolderProps> = ({ name, files, defaultOpen = false, onFileClick }) => {
  const [isOpen, setOpen] = useState(defaultOpen)

  return (
    <>
      <button
        className="flex items-center w-full px-4 py-2 bg-gray-50 border-b focus:outline-none"
        onClick={() => setOpen(!isOpen)}
      >
        {isOpen ? <FaChevronDown /> : <FaChevronRight />}
        <FaFolder className="ml-2 mr-2" />
        <span className="font-semibold">{name}</span>
      </button>

      {isOpen && (
        <div className="pl-8">
          {files &&
            files.map((file, key) => {
              if (file.type === 'folder') {
                return <Folder key={key} name={file.name} files={file.children} onFileClick={onFileClick} />
              }

              return <File key={key} name={file.name} path={file.path} onFileClick={onFileClick} />
            })}
        </div>
      )}
    </>
  )
}

export default Folder
