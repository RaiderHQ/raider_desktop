import React, { useState, useEffect } from 'react'

interface CommandBlockProps {
  command: string
  index: number
  showCode: boolean
  onDragStart: (index: number) => void
  onDragEnter: (index: number) => void
  onDragEnd: () => void
  onDelete: (index: number) => void
}

const CommandBlock: React.FC<CommandBlockProps> = ({
  command,
  index,
  showCode,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDelete
}) => {
  const [mainCommand, comment] = command.split(' # ')

  const [friendlyText, setFriendlyText] = useState('Loading...')

  useEffect(() => {
    let isMounted = true

    if (!showCode) {
      setFriendlyText('Loading...')
      window.api.commandParser(mainCommand).then((text) => {
        if (isMounted) {
          setFriendlyText(text)
        }
      })
    }

    return () => {
      isMounted = false
    }
  }, [mainCommand, showCode])

  const CodeView = () => (
    <div className="font-mono text-sm">
      <span className="text-blue-700">{mainCommand}</span>
      {comment && <span className="text-gray-500 ml-2"># {comment}</span>}
    </div>
  )

  const FriendlyView = () => (
    <div className="font-sans text-sm">
      <span className="text-gray-800">{friendlyText}</span>
    </div>
  )

  return (
    <div className="relative w-full mb-3">
      <div className="absolute -right-1 -bottom-1 w-full h-full" />
      <div
        className="relative bg-white p-3 pl-4 pr-8 rounded-lg border border-black cursor-grab active:cursor-grabbing transition-shadow duration-200 z-10"
        draggable
        onDragStart={() => onDragStart(index)}
        onDragEnter={() => onDragEnter(index)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
      >
        {showCode ? <CodeView /> : <FriendlyView />}

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
