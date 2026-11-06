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
  shortcuts: { accelerator: 'CmdOrCtrl+Shift+/', mac: '⌘⇧/', other: 'Ctrl+Shift+/' }
}

export function shortcutLabel(id: ShortcutId, platform: Platform): string {
  return platform === 'mac' ? SHORTCUTS[id].mac : SHORTCUTS[id].other
}

/** 'mac' when the platform string starts with Mac; the renderer passes navigator.platform, main passes process.platform === 'darwin' ? 'Mac' : '' */
export function platformFrom(platform: string | undefined): Platform {
  return /^mac/i.test(platform ?? '') ? 'mac' : 'other'
}
