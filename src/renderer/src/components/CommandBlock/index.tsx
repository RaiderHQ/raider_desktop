import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ParsedCommand } from '@foundation/Types/command'

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
  const { t } = useTranslation()
  const [mainCommand, comment] = command.split(' # ')
  const [parsedCommand, setParsedCommand] = useState<string | ParsedCommand>('Loading...')

  useEffect((): (() => void) => {
    let isMounted = true

    if (!showCode) {
      setParsedCommand('Loading...')
      const parser = mainCommand.includes(':xpath,')
        ? window.api.xpathParser
        : window.api.commandParser
      parser(mainCommand).then((result: string | ParsedCommand) => {
        if (isMounted) {
          setParsedCommand(result)
        }
      })
    }

    return (): void => {
      isMounted = false
    }
  }, [mainCommand, showCode])

  const CodeView = (): JSX.Element => (
    <div className="font-mono text-sm">
      <span className="text-blue-700">{mainCommand}</span>
      {comment && <span className="text-gray-500 ml-2"># {comment}</span>}
    </div>
  )

  const FriendlyView = (): JSX.Element => {
    if (typeof parsedCommand === 'string') {
      return <span className="text-gray-800">{parsedCommand}</span>
    }
    const { key, values } = parsedCommand
    return <span className="text-gray-800">{t(key, values)}</span>
  }

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
