import React from 'react'

interface CommandBlockProps {
  command: string
  index: number
  onDragStart: (index: number) => void
  onDragEnter: (index: number) => void
  onDragEnd: () => void
  // Add a new prop for the delete handler
  onDelete: (index: number) => void
}

const CommandBlock: React.FC<CommandBlockProps> = ({
                                                     command,
                                                     index,
                                                     onDragStart,
                                                     onDragEnter,
                                                     onDragEnd,
                                                     onDelete
                                                   }) => {
  // Split the command from its comment for separate styling
  const [mainCommand, comment] = command.split(' # ')

  return (
    <div
      className="relative bg-white p-3 pl-4 pr-8 mb-2 rounded-md shadow-sm border border-gray-200 font-mono text-sm cursor-grab active:cursor-grabbing transition-shadow duration-200"
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* Command Text */}
      <div>
        <span className="text-blue-700">{mainCommand}</span>
        {comment && <span className="text-gray-400 ml-2"># {comment}</span>}
      </div>

      {/* Delete Button */}
      <button
        onClick={() => onDelete(index)}
        className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full text-gray-500 hover:bg-red-100 hover:text-red-600 transition-colors"
        aria-label="Delete step"
      >
        <span className="text-xl font-light select-none">×</span>
      </button>
    </div>
  )
}

export default CommandBlock
