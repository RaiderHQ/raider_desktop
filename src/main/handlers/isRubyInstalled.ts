import isRbenvRubyInstalled from './isRbenvRubyInstalled'
import isRvmRubyInstalled from './isRvmRubyInstalled'
import isSystemRubyInstalled from './isSystemRubyInstalled'
import checkRubyDependencies from './checkRubyDependencies'

const handler = async (): Promise<{
  success: boolean
  version?: string
  error?: string
  missingGems?: string[]
  rubyCommand?: string
}> => {
  console.log('Checking for rbenv Ruby...')
  const rbenvResult = await isRbenvRubyInstalled()
  console.log('rbenv result:', rbenvResult)
  if (rbenvResult.success && rbenvResult.version) {
    const rubyCommandPrefix = `eval "$(rbenv init -)" && rbenv shell ${rbenvResult.version} &&`
    console.log(`Checking dependencies with rbenv command: ${rubyCommandPrefix}`)
    const depsResult = await checkRubyDependencies(rubyCommandPrefix)
    console.log('rbenv deps result:', depsResult)
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

  console.log('Checking for rvm Ruby...')
  const rvmResult = await isRvmRubyInstalled()
  console.log('rvm result:', rvmResult)
  if (rvmResult.success && rvmResult.version) {
    const rubyCommandPrefix = `source $(brew --prefix rvm)/scripts/rvm && rvm ${rvmResult.version} do`
    console.log(`Checking dependencies with rvm command: ${rubyCommandPrefix}`)
    const depsResult = await checkRubyDependencies(rubyCommandPrefix)
    console.log('rvm deps result:', depsResult)
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

  console.log('Checking for system Ruby...')
  const systemResult = await isSystemRubyInstalled()
  console.log('system result:', systemResult)
  if (systemResult.success) {
    const rubyCommandPrefix = ''
    console.log('Checking dependencies with system ruby.')
    const depsResult = await checkRubyDependencies(rubyCommandPrefix)
    console.log('system deps result:', depsResult)
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

  console.log('No suitable Ruby version found.')
  return {
    success: false,
    error: 'No suitable Ruby version found.'
  }
}

export default handler
