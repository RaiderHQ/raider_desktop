import { ShellExecutor } from '../shell/ShellExecutor'

const handler = async (
  rubyCommandPrefix: string
): Promise<{ success: boolean; missingGems: string[] }> => {
  const gems = ['selenium-webdriver', 'ruby_raider', 'rspec']
  const executor = ShellExecutor.create()

  // Check each gem using ShellExecutor
  const checks = gems.map(async (gem) => {
    const command = `${rubyCommandPrefix} gem list -i ${gem}`
    const result = await executor.execute(command)

    if (!result.success || !result.output.includes('true')) {
      return gem // Gem is missing
    }
    return null // Gem is installed
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
