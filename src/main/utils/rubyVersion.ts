const MIN_MAJOR = 3
const MIN_MINOR = 1

export function parseRubyVersion(
  versionString: string
): { major: number; minor: number; patch: number } | null {
  const match = versionString.match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  }
}

export function isRubyVersionSufficient(major: number, minor: number): boolean {
  return major > MIN_MAJOR || (major === MIN_MAJOR && minor >= MIN_MINOR)
}

export function formatMinimumVersion(): string {
  return `${MIN_MAJOR}.${MIN_MINOR}.0`
}
