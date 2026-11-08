export type ShortcutId =
  | 'save'
  | 'run'
  | 'record'
  | 'stop'
  | 'new-test'
  | 'new-project'
  | 'open-project'
  | 'open-file'
  | 'shortcuts'

export type Platform = 'mac' | 'other'

export const SHORTCUTS: Record<ShortcutId, { accelerator: string; mac: string; other: string }> = {
  save: { accelerator: 'CmdOrCtrl+S', mac: '⌘S', other: 'Ctrl+S' },
  run: { accelerator: 'CmdOrCtrl+R', mac: '⌘R', other: 'Ctrl+R' },
  record: { accelerator: 'CmdOrCtrl+Shift+R', mac: '⌘⇧R', other: 'Ctrl+Shift+R' },
  stop: { accelerator: 'CmdOrCtrl+Shift+R', mac: '⌘⇧R', other: 'Ctrl+Shift+R' },
  'new-test': { accelerator: 'CmdOrCtrl+N', mac: '⌘N', other: 'Ctrl+N' },
  'new-project': { accelerator: 'CmdOrCtrl+Shift+N', mac: '⌘⇧N', other: 'Ctrl+Shift+N' },
  'open-project': { accelerator: 'CmdOrCtrl+O', mac: '⌘O', other: 'Ctrl+O' },
  'open-file': { accelerator: 'CmdOrCtrl+Shift+E', mac: '⌘⇧E', other: 'Ctrl+Shift+E' },
  // Not Shift+/: macOS's Help menu owns that key for its search field
  shortcuts: { accelerator: 'CmdOrCtrl+Shift+H', mac: '⌘⇧H', other: 'Ctrl+Shift+H' }
}

/**
 * The Tests list's own keys, handled by the list while it has focus. The menu bar shows them
 * but never registers them: Cmd+D and Cmd+Backspace belong to Monaco and text fields elsewhere.
 */
export const LIST_SHORTCUTS = {
  'duplicate-test': { accelerator: 'CmdOrCtrl+D', mac: '⌘D', other: 'Ctrl+D' },
  'delete-test': { accelerator: 'CmdOrCtrl+Backspace', mac: '⌘⌫', other: 'Ctrl+Backspace' }
} as const

export function shortcutLabel(id: ShortcutId, platform: Platform): string {
  return platform === 'mac' ? SHORTCUTS[id].mac : SHORTCUTS[id].other
}

/** 'mac' when the platform string starts with Mac; the renderer passes navigator.platform, main passes process.platform === 'darwin' ? 'Mac' : '' */
export function platformFrom(platform: string | undefined): Platform {
  return /^mac/i.test(platform ?? '') ? 'mac' : 'other'
}
