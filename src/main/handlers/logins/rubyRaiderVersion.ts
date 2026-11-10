// A version number as bundler prints it; bounded, since the text comes from the project
const VERSION = String.raw`\d{1,6}(?:\.\d{1,6}){0,5}`

/** The ruby_raider version locked in a Gemfile.lock, or null when it is not listed. */
export function rubyRaiderVersion(lockText: string): string | null {
  return lockText.match(new RegExp(`^ {4}ruby_raider \\((${VERSION})\\)`, 'm'))?.[1] ?? null
}

// The active `gem 'ruby_raider', '~> 3.15'` line of a Gemfile (either quote style, one
// requirement). Only blanks, never `\s`: the file is untrusted and `\s` would cross lines. A
// requirement continued on the next line reads as no pin (the lock, once bundled, decides).
const PIN_LINE = /^[ \t]*gem[ \t]+(['"])ruby_raider\1[ \t]*,[ \t]*(['"])([^'"\n]{1,64})\2/

/**
 * The version a Gemfile holds ruby_raider at, from a `~>` or `=` requirement (a `>=` floor
 * lets bundler pick 4.x, so it names no version), or null when the gem is not pinned there.
 * A commented line does not count.
 */
export function rubyRaiderPin(gemfileText: string): string | null {
  for (const line of gemfileText.split('\n')) {
    if (line.trimStart().startsWith('#')) continue
    const requirement = line.match(PIN_LINE)?.[3]?.trim()
    if (requirement === undefined) continue
    if (requirement.startsWith('>')) return null
    return requirement.match(new RegExp(VERSION))?.[0] ?? null
  }
  return null
}

/** Saved logins need ruby_raider 3.11.0 or later. */
export function supportsLoginReuse(version: string | null): boolean {
  if (!version) return false
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major > 3 || (major === 3 && minor >= 11)
}

/** Recording and running need the 4.0 runtime; an unknown version is not held against a project. */
export function supportsRuntime(version: string | null): boolean {
  if (!version) return true
  const [major = 0] = version.split('.').map(Number)
  return major >= 4
}

/** The Flows tab (`raider flow list|schedule|…`) needs ruby_raider 4.1.0 or later; unknown is no. */
export function supportsFlows(version: string | null): boolean {
  if (!version) return false
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major > 4 || (major === 4 && minor >= 1)
}
