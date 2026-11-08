/** The ruby_raider version locked in a Gemfile.lock, or null when it is not listed. */
export function rubyRaiderVersion(lockText: string): string | null {
  return lockText.match(/^ {4}ruby_raider \((\d+(?:\.\d+)*)\)/m)?.[1] ?? null
}

// The active `gem 'ruby_raider', '~> 3.15'` line of a Gemfile (either quote style, one requirement)
const PIN_LINE = /^\s*gem\s+(['"])ruby_raider\1\s*,\s*(['"])([^'"]+)\2/m

/**
 * The version a Gemfile holds ruby_raider at, from a `~>` or `=` requirement (a `>=` floor
 * lets bundler pick 4.x, so it names no version), or null when the gem is not pinned there.
 * A commented line does not count.
 */
export function rubyRaiderPin(gemfileText: string): string | null {
  const active = gemfileText
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
  const requirement = active.match(PIN_LINE)?.[3]?.trim()
  if (!requirement || requirement.startsWith('>')) return null
  return requirement.match(/(\d+(?:\.\d+)*)/)?.[1] ?? null
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
