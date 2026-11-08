const KEY = 'filesSettingsCollapsed'

/** Whether the Files tab's settings were last left collapsed to their header (for this user). */
export function loadSettingsCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveSettingsCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0')
  } catch {
    // Storage is unavailable: the settings open expanded next time
  }
}
