import { safeExec } from '../../utils/safeExec'

const handler = async (
  rubyCommandPrefix: string
): Promise<{ success: boolean; missingGems: string[] }> => {
  const gems = ['selenium-webdriver', 'ruby_raider', 'rspec']
  const checks = gems.map(async (gem) => {
    const command = `${rubyCommandPrefix} gem list -i ${gem}`
    const result = await safeExec(command, { timeout: 10_000 })
    if (result.exitCode !== 0 || !result.stdout.includes('true')) {
      return gem
    }
    return null
  })

  const results = await Promise.all(checks)
  const missingGems = results.filter((gem) => gem !== null) as string[]
  if (missingGems.length > 0) {
    return { success: false, missingGems }
  } else {
    return { success: true, missingGems: [] }
  }
}

export default handler
