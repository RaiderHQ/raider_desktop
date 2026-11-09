type GuideKind = 'test' | 'flow'

// A flow's guide is new to someone who already dismissed the test guide, so each has its own flag
const KEYS: Record<GuideKind, string> = {
  test: 'recorderGuideSeen',
  flow: 'recorderFlowGuideSeen'
}

/** Whether the person has already dismissed the first-recording guide (of a test or a flow). */
export function hasSeenGuide(kind: GuideKind = 'test'): boolean {
  try {
    return localStorage.getItem(KEYS[kind]) === '1'
  } catch {
    return false
  }
}

export function markGuideSeen(kind: GuideKind = 'test'): void {
  try {
    localStorage.setItem(KEYS[kind], '1')
  } catch {
    // Storage is unavailable: the guide simply shows again next time
  }
}
