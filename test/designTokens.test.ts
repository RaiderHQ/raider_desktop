import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
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

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(name) ? [full] : []
  })

/**
 * WCAG "large text" is 24 px, or about 18.7 px bold: text-2xl and up at any weight,
 * or text-lg / text-xl in a semibold or bold face. Disabled controls are exempt.
 * The check is line by line, so a size set on another line of a className is not seen.
 */
const isLargeText = (line: string): boolean =>
  /text-(2xl|3xl|4xl|5xl|6xl)\b/.test(line) ||
  (/text-(lg|xl)\b/.test(line) && /font-(semibold|bold|extrabold)\b/.test(line))

describe('neutral text tokens', () => {
  it('has a token for small grey text that passes 4.5:1 on white', () => {
    expect(neutral.md).toBe('#6B6B6B')
    expect(contrast(neutral.md, '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps the lighter token for large text only (3:1)', () => {
    expect(neutral.mid).toBe('#8A8A8A')
    expect(contrast(neutral.mid, '#FFFFFF')).toBeGreaterThanOrEqual(3)
  })

  it('does not use the light token for text that is not large', () => {
    const root = resolve(__dirname, '../src/renderer/src')
    const offenders = sourceFiles(root).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line: line.replace(/disabled:text-neutral-mid/g, ''), i }))
        .filter(({ line }) => line.includes('text-neutral-mid') && !isLargeText(line))
        .map(({ i }) => `${file.slice(root.length + 1)}:${i + 1}`)
    )
    expect(offenders).toEqual([])
  })
})
