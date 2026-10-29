import { describe, it, expect } from 'vitest'
import { toMediaUrl } from '../src/renderer/src/foundation/mediaUrl'

describe('toMediaUrl', () => {
  it('encodes the absolute path into a raider-media url', () => {
    expect(toMediaUrl('/a b/raider-results/attachments/x/clip.webm')).toBe(
      'raider-media://file/%2Fa%20b%2Fraider-results%2Fattachments%2Fx%2Fclip.webm'
    )
  })

  it('round-trips through URL parsing', () => {
    const p = '/tmp/p#1/raider-results/attachments/x/c?.webm'
    const u = new URL(toMediaUrl(p))
    expect(u.host).toBe('file')
    expect(decodeURIComponent(u.pathname.slice(1))).toBe(p)
  })
})
