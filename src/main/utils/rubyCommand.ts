// The shell prefixes that select a Ruby, shared by the code that builds them
// (isRubyInstalled) and the code that validates them before running, so they can't drift.
export const rbenvPrefix = (version: string): string =>
  `eval "$(rbenv init -)" && rbenv shell ${version} &&`
export const rvmPrefix = (version: string): string =>
  `source $(brew --prefix rvm)/scripts/rvm && rvm ${version} do`

const VERSION = /^[\w.@-]+$/
const PLAIN = /^[\w./~@+-]+$/

/**
 * True for exactly the Ruby commands the app produces: `ruby`, a path to a ruby
 * binary, or the rbenv / rvm prefix pinned to one version followed by `ruby`.
 * Anything else could smuggle shell syntax into the command line.
 */
export function isValidRubyCommand(command: unknown): command is string {
  if (typeof command !== 'string') return false
  if (PLAIN.test(command)) return true
  for (const prefix of [rbenvPrefix, rvmPrefix]) {
    const [head, tail] = prefix('\u0000').split('\u0000')
    if (!command.startsWith(head) || !command.endsWith(`${tail} ruby`)) continue
    const version = command.slice(head.length, command.length - `${tail} ruby`.length)
    if (VERSION.test(version)) return true
  }
  return false
}
