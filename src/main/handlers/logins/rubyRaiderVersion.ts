/** The ruby_raider version locked in a Gemfile.lock, or null when it is not listed. */
export function rubyRaiderVersion(lockText: string): string | null {
  return lockText.match(/^ {4}ruby_raider \((\d+(?:\.\d+)*)\)/m)?.[1] ?? null
}

/** Saved logins need ruby_raider 3.11.0 or later. */
export function supportsLoginReuse(version: string | null): boolean {
  if (!version) return false
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major > 3 || (major === 3 && minor >= 11)
}
