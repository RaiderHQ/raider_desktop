import { exec } from 'child_process'

const handler = (
  rubyCommandPrefix: string
): Promise<{ success: boolean; missingGems: string[] }> => {
  console.log(`Checking for gems with command prefix: '${rubyCommandPrefix}'`)
  return new Promise((resolve) => {
    const gems = ['selenium-webdriver', 'ruby_raider', 'rspec']
    const checks = gems.map(
      (gem) =>
        new Promise((resolveCheck) => {
          const command = `${rubyCommandPrefix} gem list -i ${gem}`
          console.log(`Executing: ${command}`)
          exec(command, (error, stdout) => {
            if (error || !stdout.includes('true')) {
              console.log(`Gem '${gem}' is missing.`)
              resolveCheck(gem)
            } else {
              console.log(`Gem '${gem}' is installed.`)
              resolveCheck(null)
            }
          })
        })
    )

    Promise.all(checks).then((results) => {
      const missingGems = results.filter((gem) => gem !== null) as string[]
      if (missingGems.length > 0) {
        console.log('Missing gems:', missingGems)
        resolve({ success: false, missingGems })
      } else {
        console.log('All gems are installed.')
        resolve({ success: true, missingGems: [] })
      }
    })
  })
}

export default handler
