/**
 * macOS gives GUI apps no LANG, so Ruby falls back to US-ASCII and chokes on any
 * non-ASCII byte in ruby_raider's templates ("invalid multibyte char (US-ASCII)").
 * The same way fix-path repairs PATH, this gives every child process a UTF-8
 * character type, touching only the variable that is in the way: Ruby reads
 * LC_ALL, then LC_CTYPE, then LANG.
 */
const UTF8_LOCALE = 'en_US.UTF-8'

const namesUtf8 = (value: string | undefined): boolean =>
  typeof value === 'string' && /utf-?8/i.test(value)

export function ensureUtf8Locale(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const effective = env.LC_ALL || env.LC_CTYPE || env.LANG
  if (namesUtf8(effective)) return { ...env }
  if (!effective) return { ...env, LANG: UTF8_LOCALE }
  // Something is set but not UTF-8: override the variable that decides the character type
  if (env.LC_ALL) return { ...env, LC_ALL: UTF8_LOCALE }
  return { ...env, LC_CTYPE: UTF8_LOCALE }
}

/** Repairs process.env in place so spawn, exec and node-pty children all inherit it. */
export function applyUtf8Locale(): void {
  Object.assign(process.env, ensureUtf8Locale(process.env))
}
