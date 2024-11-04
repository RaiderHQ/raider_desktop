import React, { useState } from 'react'
import { FaPlay, FaStop } from 'react-icons/fa'
import Button from '@components/Button'
import Folder from '@components/Library/Folder'
import useProjectStore from '@foundation/Stores/projectStore'
import { FileNode } from '@foundation/Types/fileNode'

const Overview: React.FC = () => {
  const projectPath: string = useProjectStore((state: { projectPath: string }) => state.projectPath)
  const files: FileNode[] = useProjectStore((state: { files: FileNode[] }) => state.files)
  const toggleAll: (select: boolean) => void = useProjectStore(
    (state: { toggleAll: (select: boolean) => void }) => state.toggleAll
  )
  const [allSelected, setAllSelected] = useState(false)

  const handlePlay = (): void => {
    console.log('Play button clicked')
  }

  const handleStop = (): void => {
    console.log('Stop button clicked')
  }

  return (
    <div className="flex flex-col w-screen p-8">
      <div className="flex items-center justify-between mb-4 bg-gray-200 p-2 rounded-md">
        <div className="flex items-center space-x-1">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => {
              setAllSelected(!allSelected)
              toggleAll(!allSelected)
            }}
            className="w-5 h-5 cursor-pointer border border-black rounded"
          />

          <button
            onClick={handlePlay}
            className="text-green-500 border border-green-500 rounded w-5 h-5 flex items-center justify-center hover:bg-green-50"
            title="Play"
          >
            <FaPlay size={12} />
          </button>
          <button
            onClick={handleStop}
            className="text-red-500 border border-red-500 rounded w-5 h-5 flex items-center justify-center hover:bg-red-50"
            title="Stop"
          >
            <FaStop size={12} />
          </button>
        </div>

        <Button onClick={() => console.log('Open Allure Dashboard clicked')} type="primary">
          Allure Dashboard
        </Button>
      </div>

      <div className="h-[70vh] border rounded-lg shadow-sm overflow-y-auto bg-white">
        <Folder name={projectPath.split('/').pop()} files={files} defaultOpen />
      </div>
    </div>
  )
}

export default Overview
