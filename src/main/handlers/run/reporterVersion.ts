/** The raider_reporter version locked in a Gemfile.lock, or null when it is not listed. */
export function reporterVersion(lockText: string): string | null {
  return lockText.match(/^\s{4}raider_reporter \((\d+(?:\.\d+)*)\)/m)?.[1] ?? null
}

/** Live run events need raider_reporter 0.11.0 or later. */
export function supportsLiveEvents(version: string | null): boolean {
  if (!version) return false
  const [major = 0, minor = 0] = version.split('.').map(Number)
  return major > 0 || minor >= 11
}
