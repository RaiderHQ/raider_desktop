import { exec } from 'child_process'

const handler = (
  rubyCommandPrefix: string
): Promise<{ success: boolean; missingGems: string[] }> => {
  return new Promise((resolve) => {
    const gems = ['selenium-webdriver', 'ruby_raider', 'rspec']
    const checks = gems.map(
      (gem) =>
        new Promise((resolveCheck) => {
          const command = `${rubyCommandPrefix} gem list -i ${gem}`
          exec(command, (error, stdout) => {
            if (error || !stdout.includes('true')) {
              resolveCheck(gem)
            } else {
              resolveCheck(null)
            }
          })
        })
    )

    Promise.all(checks).then((results) => {
      const missingGems = results.filter((gem) => gem !== null) as string[]
      if (missingGems.length > 0) {
        resolve({ success: false, missingGems })
      } else {
        resolve({ success: true, missingGems: [] })
      }
    })
  })
}

export default handler
