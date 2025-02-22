import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from 'xterm'
import 'xterm/css/xterm.css'

const Terminal: React.FC = () => {
  const terminalContainerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const commandBuffer = useRef<string>('')

  useEffect(() => {
    const terminal = new XTerm({
      cursorBlink: true,
      rows: 30,
      cols: 80
    })
    xtermRef.current = terminal

    if (terminalContainerRef.current) {
      terminal.open(terminalContainerRef.current)
      terminal.focus()
      terminal.write('$ ')
    }

    terminal.onKey(({ key, domEvent }) => {
      const k = domEvent.key

      if (k === 'Enter') {
        terminal.write('\r\n')
        const command = commandBuffer.current.trim()
        if (command) {
          ;(async () => {
            try {
              const result = await window.api.runCommand(command)
              if (result.success) {
                terminal.write(result.output + '\r\n')
              } else {
                terminal.write('Error: ' + result.error + '\r\n')
              }
            } catch (err: any) {
              terminal.write('Error executing command: ' + err.message + '\r\n')
            }
            terminal.write('$ ')
          })()
        } else {
          terminal.write('$ ')
        }
        commandBuffer.current = ''
      } else if (k === 'Backspace') {
        if (commandBuffer.current.length > 0) {
          commandBuffer.current = commandBuffer.current.slice(0, -1)
          terminal.write('\b \b')
        }
      } else if (k.length === 1) {
        commandBuffer.current += key
        terminal.write(key)
      }
    })

    return () => {
      terminal.dispose()
    }
  }, [])

  return (
    <div className="relative w-full">
      <div className="absolute -right-1 -bottom-1 w-full h-full bg-[#c14420] rounded-lg" />
      <div
        className="relative border rounded-lg shadow-sm overflow-y-auto bg-white z-10"
        style={{ height: '300px' }}
      >
        <div
          ref={terminalContainerRef}
          tabIndex={0}
          className="w-full h-full"
          onClick={() => xtermRef.current?.focus()}
        />
      </div>
    </div>
  )
}

export default Terminal
