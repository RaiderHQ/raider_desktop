import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import path from 'path'

let ptyProcess: pty.IPty | null = null

function resolveShell(): string {
  if (process.platform === 'win32') return 'powershell.exe'

  const candidates = [
    process.env.SHELL,
    '/bin/zsh',
    '/bin/bash',
    '/bin/sh'
  ].filter(Boolean) as string[]

  for (const s of candidates) {
    if (existsSync(s)) return s
  }
  return '/bin/sh'
}

function cleanEnv(): Record<string, string> {
  // node-pty requires all env values to be strings — filter out undefined/null
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value != null) {
      env[key] = value
    }
  }
  env.TERM = 'xterm-256color'
  return env
}

export function spawnTerminal(
  mainWindow: BrowserWindow,
  cwd: string,
  cols: number,
  rows: number
): void {
  // Kill existing terminal if any
  killTerminal()

  const shell = resolveShell()
  const resolvedCwd = existsSync(cwd) ? path.resolve(cwd) : process.env.HOME || '/'

  try {
    ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: Math.max(cols, 1),
      rows: Math.max(rows, 1),
      cwd: resolvedCwd,
      env: cleanEnv()
    })
  } catch (err) {
    // Log details for debugging, then re-throw
    console.error('[terminal] spawn failed', { shell, resolvedCwd, cols, rows, err })
    throw err
  }

  ptyProcess.onData((data: string) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-data', data)
    }
  })

  ptyProcess.onExit(() => {
    ptyProcess = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('terminal-exit')
    }
  })
}

export function writeTerminal(data: string): void {
  if (ptyProcess) {
    ptyProcess.write(data)
  }
}

export function resizeTerminal(cols: number, rows: number): void {
  if (ptyProcess) {
    ptyProcess.resize(cols, rows)
  }
}

export function killTerminal(): void {
  if (ptyProcess) {
    ptyProcess.kill()
    ptyProcess = null
  }
}
