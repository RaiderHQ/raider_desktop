import { safeExec } from '../../utils/safeExec'
import { parseRubyVersion, isRubyVersionSufficient } from '../../utils/rubyVersion'

const handler = async (): Promise<{ success: boolean; version?: string; error?: string }> => {
  const result = await safeExec('rvm list strings', { timeout: 10_000 })

  if (result.exitCode !== 0) {
    return { success: false, error: result.stderr.trim() }
  }

  const versions = result.stdout.trim().split('\n')
  const suitableVersion = versions.find((version) => {
    const parsed = parseRubyVersion(version)
    return parsed ? isRubyVersionSufficient(parsed.major, parsed.minor) : false
  })

  if (suitableVersion) {
    return { success: true, version: suitableVersion }
  } else {
    return { success: false, error: 'No suitable Ruby version found with rvm.' }
  }
}

export default handler
