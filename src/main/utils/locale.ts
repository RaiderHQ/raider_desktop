/**
 * macOS gives GUI apps no LANG, so Ruby falls back to US-ASCII and chokes on any
 * non-ASCII byte in ruby_raider's templates ("invalid multibyte char (US-ASCII)").
 * The same way fix-path repairs PATH, this gives every child process a UTF-8 locale
 * unless one is already set.
 */
const UTF8_LOCALE = 'en_US.UTF-8'

const namesUtf8 = (value: string | undefined): boolean =>
  typeof value === 'string' && /utf-?8/i.test(value)

export function ensureUtf8Locale(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (namesUtf8(env.LC_ALL) || namesUtf8(env.LC_CTYPE) || namesUtf8(env.LANG)) return { ...env }
  return { ...env, LANG: UTF8_LOCALE, LC_ALL: UTF8_LOCALE }
}

/** Repairs process.env in place so spawn, exec and node-pty children all inherit it. */
export function applyUtf8Locale(): void {
  Object.assign(process.env, ensureUtf8Locale(process.env))
}
