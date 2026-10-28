// Stack-frame helpers shared by the failed-test card. The rules mirror the
// raider_saas implementation: keep them identical.

const FRAME_RE = /^((?:[A-Za-z]:)?[^:]+):(\d+)(?::in .*)?$/

export type FrameSegment = { kind: 'project'; text: string } | { kind: 'folded'; lines: string[] }

export const parseFrame = (s: string): { file: string; line: number } | null => {
  const m = FRAME_RE.exec(s)
  return m ? { file: m[1], line: Number(m[2]) } : null
}

export const isProjectFrame = (line: string, appFrame?: string): boolean => {
  const frame = parseFrame(line)
  if (!frame) return false
  const app = appFrame ? parseFrame(appFrame) : null
  if (app && frame.file === app.file) return true
  const { file } = frame
  if (file.startsWith('/') || /^[A-Za-z]:/.test(file)) return false
  if (file.startsWith('vendor/') || file.startsWith('.bundle/') || file.startsWith('<internal:'))
    return false
  return !file.includes('/gems/')
}

export const foldFrames = (lines: string[], appFrame?: string): FrameSegment[] => {
  const segments: FrameSegment[] = []
  for (const text of lines) {
    if (isProjectFrame(text, appFrame)) {
      segments.push({ kind: 'project', text })
      continue
    }
    const last = segments[segments.length - 1]
    if (last?.kind === 'folded') last.lines.push(text)
    else segments.push({ kind: 'folded', lines: [text] })
  }
  return segments
}
