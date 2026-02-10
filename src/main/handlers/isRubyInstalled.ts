import isRbenvRubyInstalled from './isRbenvRubyInstalled'
import isRvmRubyInstalled from './isRvmRubyInstalled'
import isSystemRubyInstalled from './isSystemRubyInstalled'
import checkRubyDependencies from './checkRubyDependencies'
import { isWindows } from '../utils/platformDetection'
import { isWindowsRubyInstalled } from './windows/isWindowsRubyInstalled'

const handler = async (): Promise<{
  success: boolean
  version?: string
  error?: string
  missingGems?: string[]
  rubyCommand?: string
}> => {
  // Windows: Use Windows-specific Ruby detection
  if (isWindows()) {
    const windowsResult = await isWindowsRubyInstalled()
    if (windowsResult.success && windowsResult.rubyCommand) {
      // Check for required gems (selenium-webdriver, rspec, ruby_raider)
      const rubyPrefix = windowsResult.rubyCommand.replace(' ruby', '').trim()
      const depsResult = await checkRubyDependencies(rubyPrefix)
      return {
        ...windowsResult,
        success: depsResult.success,
        missingGems: depsResult.missingGems
      }
    }
    return {
      success: false,
      error: windowsResult.error || 'No Ruby 3.x installation found. Please install RubyInstaller or Chocolatey Ruby.'
    }
  }

  // Unix (macOS/Linux): Use existing rbenv → RVM → system detection
  const rbenvResult = await isRbenvRubyInstalled()
  if (rbenvResult.success && rbenvResult.version) {
    const rubyCommandPrefix = `eval "$(rbenv init -)" && rbenv shell ${rbenvResult.version} &&`
    const depsResult = await checkRubyDependencies(rubyCommandPrefix)
    if (depsResult.success) {
      return { ...rbenvResult, rubyCommand: `${rubyCommandPrefix} ruby` }
    }
    return {
      ...rbenvResult,
      success: false,
      missingGems: depsResult.missingGems,
      rubyCommand: rubyCommandPrefix
    }
  }

  const rvmResult = await isRvmRubyInstalled()
  if (rvmResult.success && rvmResult.version) {
    const rubyCommandPrefix = `source $(brew --prefix rvm)/scripts/rvm && rvm ${rvmResult.version} do`
    const depsResult = await checkRubyDependencies(rubyCommandPrefix)
    if (depsResult.success) {
      return { ...rvmResult, rubyCommand: `${rubyCommandPrefix} ruby` }
    }
    return {
      ...rvmResult,
      success: false,
      missingGems: depsResult.missingGems,
      rubyCommand: rubyCommandPrefix
    }
  }

  const systemResult = await isSystemRubyInstalled()
  if (systemResult.success) {
    const rubyCommandPrefix = ''
    const depsResult = await checkRubyDependencies(rubyCommandPrefix)
    if (depsResult.success) {
      return { ...systemResult, rubyCommand: 'ruby' }
    }
    return {
      ...systemResult,
      success: false,
      missingGems: depsResult.missingGems,
      rubyCommand: rubyCommandPrefix
    }
  }

  return {
    success: false,
    error: 'No suitable Ruby version found.'
  }
}

export default handler
