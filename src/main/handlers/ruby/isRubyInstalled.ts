import isRbenvRubyInstalled from './isRbenvRubyInstalled'
import isRvmRubyInstalled from './isRvmRubyInstalled'
import isSystemRubyInstalled from './isSystemRubyInstalled'
import checkRubyDependencies from './checkRubyDependencies'
import { parseRubyVersion, formatMinimumVersion } from '../../utils/rubyVersion'
import { setRubyVersion } from '../appState'

function getVersionWarning(version?: string): string | undefined {
  if (!version) return undefined
  const parsed = parseRubyVersion(version)
  if (!parsed) return undefined
  // If version is >= 3.0.0 but < 3.1.0, warn the user
  if (parsed.major === 3 && parsed.minor === 0) {
    return `Ruby ${parsed.major}.${parsed.minor}.${parsed.patch} is below the minimum ${formatMinimumVersion()} required by Ruby Raider v3. Some features may not work correctly.`
  }
  return undefined
}

type SubResult = { success: boolean; version?: string; error?: string }

function mapVersion(result: SubResult): { success: boolean; rubyVersion?: string; error?: string } {
  const { version, ...rest } = result
  return { ...rest, rubyVersion: version }
}

const handler = async (): Promise<{
  success: boolean
  rubyVersion?: string
  error?: string
  missingGems?: string[]
  rubyCommand?: string
  versionWarning?: string
}> => {
  // On Windows, Ruby is installed via RubyInstaller and available on PATH directly
  if (process.platform === 'win32') {
    const systemResult = await isSystemRubyInstalled()
    if (systemResult.success) {
      if (systemResult.version) setRubyVersion(systemResult.version)
      const rubyCommandPrefix = ''
      const depsResult = await checkRubyDependencies(rubyCommandPrefix)
      const versionWarning = getVersionWarning(systemResult.version)
      if (depsResult.success) {
        return { ...mapVersion(systemResult), rubyCommand: 'ruby', versionWarning }
      }
      return {
        ...mapVersion(systemResult),
        success: false,
        missingGems: depsResult.missingGems,
        rubyCommand: rubyCommandPrefix,
        versionWarning
      }
    }
    return {
      success: false,
      error: 'Ruby not found on PATH. Install Ruby via RubyInstaller (rubyinstaller.org).'
    }
  }

  // macOS/Linux: try rbenv, then rvm, then system ruby
  const rbenvResult = await isRbenvRubyInstalled()
  if (rbenvResult.success && rbenvResult.version) {
    setRubyVersion(rbenvResult.version)
    const rubyCommandPrefix = `eval "$(rbenv init -)" && rbenv shell ${rbenvResult.version} &&`
    const depsResult = await checkRubyDependencies(rubyCommandPrefix)
    const versionWarning = getVersionWarning(rbenvResult.version)
    if (depsResult.success) {
      return { ...mapVersion(rbenvResult), rubyCommand: `${rubyCommandPrefix} ruby`, versionWarning }
    }
    return {
      ...mapVersion(rbenvResult),
      success: false,
      missingGems: depsResult.missingGems,
      rubyCommand: rubyCommandPrefix,
      versionWarning
    }
  }

  const rvmResult = await isRvmRubyInstalled()
  if (rvmResult.success && rvmResult.version) {
    setRubyVersion(rvmResult.version)
    const rubyCommandPrefix = `source $(brew --prefix rvm)/scripts/rvm && rvm ${rvmResult.version} do`
    const depsResult = await checkRubyDependencies(rubyCommandPrefix)
    const versionWarning = getVersionWarning(rvmResult.version)
    if (depsResult.success) {
      return { ...mapVersion(rvmResult), rubyCommand: `${rubyCommandPrefix} ruby`, versionWarning }
    }
    return {
      ...mapVersion(rvmResult),
      success: false,
      missingGems: depsResult.missingGems,
      rubyCommand: rubyCommandPrefix,
      versionWarning
    }
  }

  const systemResult = await isSystemRubyInstalled()
  if (systemResult.success) {
    if (systemResult.version) setRubyVersion(systemResult.version)
    const rubyCommandPrefix = ''
    const depsResult = await checkRubyDependencies(rubyCommandPrefix)
    const versionWarning = getVersionWarning(systemResult.version)
    if (depsResult.success) {
      return { ...mapVersion(systemResult), rubyCommand: 'ruby', versionWarning }
    }
    return {
      ...mapVersion(systemResult),
      success: false,
      missingGems: depsResult.missingGems,
      rubyCommand: rubyCommandPrefix,
      versionWarning
    }
  }

  return {
    success: false,
    error: 'No suitable Ruby version found.'
  }
}

export default handler
