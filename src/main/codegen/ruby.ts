/** Single-quoted Ruby literal; only `\` and `'` are special, so `#{}` stays inert. */
export function rubyString(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}
