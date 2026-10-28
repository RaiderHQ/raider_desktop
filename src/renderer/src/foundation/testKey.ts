import type { Ownership } from '@shared/types/projectTest'

export type TestKey = string

/** One line of the Tests list: a project file test, or a suite-only ('legacy') test. */
export interface TestRow {
  name: string
  file?: string
  testId?: string
  ownership: Ownership | 'legacy'
  missingFile?: true
  suiteIds: string[]
}

export const testKeyOf = (row: TestRow): TestKey =>
  row.testId ? `id:${row.testId}` : `file:${row.file ?? ''}`

export const parseTestKey = (
  key: string
): { kind: 'id'; testId: string } | { kind: 'file'; file: string } | null => {
  if (key.startsWith('id:') && key.length > 3) return { kind: 'id', testId: key.slice(3) }
  if (key.startsWith('file:') && key.length > 5) return { kind: 'file', file: key.slice(5) }
  return null
}

/** base64url of the UTF-8 key: a file path's "/" never reaches the router. */
export const toRouteParam = (key: TestKey): string => {
  const bytes = new TextEncoder().encode(key)
  let binary = ''
  bytes.forEach((b) => (binary += String.fromCharCode(b)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Inverse of toRouteParam; '' when the param isn't one of ours. */
export const fromRouteParam = (param: string): TestKey => {
  try {
    const base64 = param.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    return new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0))
    )
  } catch {
    return ''
  }
}
