/** Single-quoted Ruby literal; only `\` and `'` are special, so `#{}` stays inert. */
export function rubyString(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

/** Single- or double-quoted Ruby string literals; blank them out before scanning code for words. */
export const STRING_LITERAL = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g
