// Mirrors the raider_saas implementation: keep the rules identical.

const FRAME_RE = /^((?:[A-Za-z]:)?[^:]+):(\d+)(?::in .*)?$/

export const parseFrame = (s: string): { file: string; line: number } | null => {
  const text = s.replace(/\r$/, '')
  if (/[\n\r\u2028\u2029]/.test(text)) return null
  const m = FRAME_RE.exec(text)
  return m ? { file: m[1], line: Number(m[2]) } : null
}
