import { safeExec } from '../../utils/safeExec'
import { parseRubyVersion, isRubyVersionSufficient, formatMinimumVersion } from '../../utils/rubyVersion'

const handler = async (): Promise<{ success: boolean; version?: string; error?: string }> => {
  const result = await safeExec('ruby -v', { timeout: 10_000 })

  if (result.exitCode !== 0) {
    return { success: false, error: result.stderr.trim() }
  }

  const parsed = parseRubyVersion(result.stdout)
  if (parsed) {
    if (isRubyVersionSufficient(parsed.major, parsed.minor)) {
      return { success: true, version: `ruby ${parsed.major}.${parsed.minor}.${parsed.patch}` }
    } else {
      return {
        success: false,
        error: `Ruby version ${parsed.major}.${parsed.minor}.${parsed.patch} is older than ${formatMinimumVersion()}.`
      }
    }
  } else {
    return { success: false, error: 'Could not parse Ruby version.' }
  }
}

export default handler
