const KEY = 'raider.recordingGuideSeen'

/** Whether the person has already dismissed the first-recording guide. */
export function hasSeenGuide(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markGuideSeen(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // Storage is unavailable: the guide simply shows again next time
  }
}
