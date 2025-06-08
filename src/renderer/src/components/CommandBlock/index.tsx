import React from 'react'

interface CommandBlockProps {
  command: string
}

const CommandBlock: React.FC<CommandBlockProps> = ({ command }) => {
  // Split the command from its comment for separate styling
  const [mainCommand, comment] = command.split(' # ')

  return (
    // This div is the styled "block" for each command.
    // The cursor styles hint at future drag-and-drop capability.
    <div className="bg-white p-3 mb-2 rounded-md shadow-sm border border-gray-200 font-mono text-sm cursor-grab active:cursor-grabbing">
      <span className="text-blue-700">{mainCommand}</span>
      {comment && <span className="text-gray-400 ml-2"># {comment}</span>}
    </div>
  )
}

export default CommandBlock
