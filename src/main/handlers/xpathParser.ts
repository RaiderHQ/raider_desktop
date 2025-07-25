export interface ParsedCommand {
  key: string
  values: Record<string, string>
}

const xpathParser = (command: string): ParsedCommand | string => {
  console.log('[xpathParser.ts] Executing with command:', command)
  // This regex part captures any of the possible selector quoting styles for XPath
  const selectorRegexPart = `(?:concat\((.+?)\)|"((?:\\"|[^"])*)"|'((?:\\'|[^'])*)')`

  const patterns: {
    regex: RegExp
    template: (matches: string[]) => ParsedCommand
  }[] = [
    {
      regex: new RegExp(
        `wait\\.until { @driver\\.find_element\\(:xpath,\\s*${selectorRegexPart}\\)\\.displayed\\? }`
      ),
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.waitForElementDisplayed',
        values: { strategy: 'xpath', value: matches[1] || matches[2] || matches[3] }
      })
    },
    {
      regex: new RegExp(
        `wait\\.until { @driver\\.find_element\\(:xpath,\\s*${selectorRegexPart}\\)\\.enabled\\? }`
      ),
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.waitForElementEnabled',
        values: { strategy: 'xpath', value: matches[1] || matches[2] || matches[3] }
      })
    },
    {
      regex: new RegExp(`@driver\\.find_element\\(:xpath,\\s*${selectorRegexPart}\\)\\.click`),
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.clickElement',
        values: { strategy: 'xpath', value: matches[1] || matches[2] || matches[3] }
      })
    },
    {
      regex: new RegExp(
        `@driver\\.find_element\\(:xpath,\\s*${selectorRegexPart}\\)\\.send_keys\\(:(\\w+)\\)`
      ),
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.pressKey',
        values: {
          key: matches[4],
          strategy: 'xpath',
          value: matches[1] || matches[2] || matches[3]
        }
      })
    },
    {
      regex: new RegExp(
        `@driver\\.find_element\\(:xpath,\\s*${selectorRegexPart}\\)\\.send_keys\\("([^"]*)"\\)`
      ),
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.typeText',
        values: {
          text: matches[4],
          strategy: 'xpath',
          value: matches[1] || matches[2] || matches[3]
        }
      })
    },
    {
      regex: new RegExp(
        `expect\\(@driver\\.find_element\\(:xpath,\\s*${selectorRegexPart}\\)\\)\\.to be_displayed$`
      ),
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementDisplayed',
        values: { strategy: 'xpath', value: matches[1] || matches[2] || matches[3] }
      })
    },
    {
      regex: new RegExp(
        `expect\\(@driver\\.find_element\\(:xpath,\\s*${selectorRegexPart}\\)\\)\\.to be_enabled`
      ),
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementEnabled',
        values: { strategy: 'xpath', value: matches[1] || matches[2] || matches[3] }
      })
    },
    {
      regex: new RegExp(
        `expect\\(@driver\\.find_element\\(:xpath,\\s*${selectorRegexPart}\\)\\.text\\)\\.to eq\\("([^"]+)"\\)`
      ),
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementTextEquals',
        values: {
          strategy: 'xpath',
          value: matches[1] || matches[2] || matches[3],
          text: matches[4]
        }
      })
    }
  ]

  for (const pattern of patterns) {
    const match = command.match(pattern.regex)
    if (match) {
      console.log('[xpathParser.ts] Found a match!', match)
      return pattern.template(match)
    }
  }

  console.log('[xpathParser.ts] No match found, returning original command.')
  return command
}

export default xpathParser
