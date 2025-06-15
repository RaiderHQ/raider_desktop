import React from 'react'

interface CommandBlockProps {
  command: string
  index: number
  onDragStart: (index: number) => void
  onDragEnter: (index: number) => void
  onDragEnd: () => void
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
    // This outer container creates the 3D drop-shadow effect
    <div className="relative w-full mb-3">
      {/* This is the orange "shadow" div, positioned behind the main content */}
      <div className="absolute -right-1 -bottom-1 w-full h-full" />

      {/* This is the main content block, now positioned relatively */}
      <div
        className="relative bg-white p-3 pl-4 pr-8 rounded-lg border border-black font-mono text-sm cursor-grab active:cursor-grabbing transition-shadow duration-200 z-10"
        draggable
        onDragStart={() => onDragStart(index)}
        onDragEnter={() => onDragEnter(index)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
      >
        {/* Command Text */}
        <div>
          <span className="text-blue-700">{mainCommand}</span>
          {comment && <span className="text-gray-500 ml-2"># {comment}</span>}
        </div>

        {/* Delete Button */}
        <button
          onClick={() => onDelete(index)}
          className="absolute top-1/2 -translate-y-1/2 right-2 w-6 h-6 flex items-center justify-center rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 transition-colors"
          aria-label="Delete step"
        >
          <span className="text-2xl font-light select-none leading-none">×</span>
        </button>
      </div>
    </div>
  )
}

export default CommandBlock
