import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { FaTimes } from 'react-icons/fa'

interface TerminalProps {
  cwd: string
  onClose: () => void
}

const Terminal: React.FC<TerminalProps> = ({ cwd, onClose }) => {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const spawnedRef = useRef(false)

  useEffect(() => {
    if (!terminalRef.current) return

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
        cursor: '#d4d4d4',
        selectionBackground: '#264f78'
      }
    })

    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)
    xterm.open(terminalRef.current)

    // Small delay to let the DOM settle before fitting
    requestAnimationFrame(() => {
      fitAddon.fit()
      xterm.focus()

      if (!spawnedRef.current) {
        spawnedRef.current = true
        window.api.terminalSpawn(cwd, xterm.cols, xterm.rows).catch((err: Error) => {
          xterm.write(`\r\n\x1b[31mFailed to start terminal: ${err.message}\x1b[0m\r\n`)
        })
      }
    })

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    // Forward user input to the main process
    const inputDisposable = xterm.onData((data: string) => {
      window.api.terminalWrite(data)
    })

    // Receive output from the main process
    const handleData = (_event: Electron.IpcRendererEvent, data: string): void => {
      xterm.write(data)
    }

    const handleExit = (): void => {
      xterm.write('\r\n[Process exited]\r\n')
    }

    window.api.onTerminalData(handleData)
    window.api.onTerminalExit(handleExit)

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (fitAddonRef.current && xtermRef.current) {
          fitAddonRef.current.fit()
          window.api.terminalResize(xtermRef.current.cols, xtermRef.current.rows)
        }
      })
    })
    resizeObserver.observe(terminalRef.current)

    return (): void => {
      inputDisposable.dispose()
      window.api.removeTerminalDataListener(handleData)
      window.api.removeTerminalExitListener(handleExit)
      resizeObserver.disconnect()
      xterm.dispose()
      window.api.terminalKill()
    }
  }, [cwd])

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-b-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#252526] border-b border-[#3c3c3c]">
        <span className="text-xs text-[#cccccc] font-medium">Terminal</span>
        <button
          onClick={onClose}
          className="text-[#cccccc] hover:text-white transition-colors p-1"
          title="Close terminal"
        >
          <FaTimes size={12} />
        </button>
      </div>
      <div
        ref={terminalRef}
        className="flex-1 p-1"
        onClick={() => xtermRef.current?.focus()}
      />
    </div>
  )
}

export default Terminal
