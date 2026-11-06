import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve } from 'path'
import config from '../tailwind.config.js'

const neutral = (config as { theme: { extend: { colors: { neutral: Record<string, string> } } } })
  .theme.extend.colors.neutral

/** WCAG relative luminance and contrast ratio */
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number): number => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a: string, b: string): number => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

describe('neutral text tokens', () => {
  it('has a token for small grey text that passes 4.5:1 on white', () => {
    expect(neutral.md).toBe('#6B6B6B')
    expect(contrast(neutral.md, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the lighter token for large text only (3:1)', () => {
    expect(neutral.mid).toBe('#8A8A8A')
    expect(contrast(neutral.mid, '#FFFFFF')).toBeGreaterThanOrEqual(3)
  })

  it('does not use the light token for text below 18 px', () => {
    // Lines that set small text (or no size at all) with the light grey token
    const out = execFileSync(
      'grep',
      ['-rn', '--include=*.tsx', 'text-neutral-mid', resolve(__dirname, '../src/renderer/src')],
      { encoding: 'utf8' }
    )
      .split('\n')
      .filter((line) => line && !/text-(lg|xl|2xl|3xl|4xl|5xl)\b/.test(line))
    expect(out).toEqual([])
  })
})
