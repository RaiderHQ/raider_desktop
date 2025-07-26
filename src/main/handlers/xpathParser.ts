export interface ParsedCommand {
  key: string
  values: Record<string, string>
}

const xpathParser = (command: string): ParsedCommand | string => {
  const patterns: {
    regex: RegExp
    template: (matches: string[]) => ParsedCommand
  }[] = [
    // waitForElementDisplayed
    {
      regex: /wait\.until { @driver\.find_element\(:xpath,\s*'([^']*)'\)\.displayed\? }$/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.waitForElementDisplayed',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },
    {
      regex: /wait\.until { @driver\.find_element\(:xpath,\s*"([^"]*)"\)\.displayed\? }$/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.waitForElementDisplayed',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },
    {
      regex: /wait\.until { @driver\.find_element\(:xpath,\s*concat\((.+?)\)\)\.displayed\? }$/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.waitForElementDisplayed',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },

    // waitForElementEnabled
    {
      regex: /wait\.until { @driver\.find_element\(:xpath,\s*'([^']*)'\)\.enabled\? }/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.waitForElementEnabled',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },
    {
      regex: /wait\.until { @driver\.find_element\(:xpath,\s*"([^"]*)"\)\.enabled\? }/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.waitForElementEnabled',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },
    {
      regex: /wait\.until { @driver\.find_element\(:xpath,\s*concat\((.+?)\)\)\.enabled\? }/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.waitForElementEnabled',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },

    // clickElement
    {
      regex: /@driver\.find_element\(:xpath,\s*'([^']*)'\)\.click/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.clickElement',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },
    {
      regex: /@driver\.find_element\(:xpath,\s*"([^"]*)"\)\.click/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.clickElement',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },
    {
      regex: /@driver\.find_element\(:xpath,\s*concat\((.+?)\)\)\.click/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.clickElement',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },

    // typeText
    {
      regex: /@driver\.find_element\(:xpath,\s*'([^']*)'\)\.send_keys\("([^"]*)"\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.typeText',
        values: { strategy: 'xpath', value: matches[1], text: matches[2] }
      })
    },
    {
      regex: /@driver\.find_element\(:xpath,\s*"([^"]*)"\)\.send_keys\("([^"]*)"\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.typeText',
        values: { strategy: 'xpath', value: matches[1], text: matches[2] }
      })
    },
    {
      regex: /@driver\.find_element\(:xpath,\s*concat\((.+?)\)\)\.send_keys\("([^"]*)"\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.typeText',
        values: { strategy: 'xpath', value: matches[1], text: matches[2] }
      })
    },

    // assertElementDisplayed
    {
      regex: /expect\(@driver\.find_element\(:xpath,\s*'([^']*)'\)\)\.to be_displayed$/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementDisplayed',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },
    {
      regex: /expect\(@driver\.find_element\(:xpath,\s*"([^"]*)"\)\)\.to be_displayed$/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementDisplayed',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },
    {
      regex: /expect\(@driver\.find_element\(:xpath,\s*concat\((.+?)\)\)\)\.to be_displayed$/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementDisplayed',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },

    // assertElementEnabled
    {
      regex: /expect\(@driver\.find_element\(:xpath,\s*'([^']*)'\)\)\.to be_enabled/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementEnabled',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },
    {
      regex: /expect\(@driver\.find_element\(:xpath,\s*"([^"]*)"\)\)\.to be_enabled/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementEnabled',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },
    {
      regex: /expect\(@driver\.find_element\(:xpath,\s*concat\((.+?)\)\)\)\.to be_enabled/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementEnabled',
        values: { strategy: 'xpath', value: matches[1] }
      })
    },

    // assertElementTextEquals
    {
      regex: /expect\(@driver\.find_element\(:xpath,\s*'([^']*)'\)\.text\)\.to eq\("([^"]+)"\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementTextEquals',
        values: { strategy: 'xpath', value: matches[1], text: matches[2] }
      })
    },
    {
      regex: /expect\(@driver\.find_element\(:xpath,\s*"([^"]*)"\)\.text\)\.to eq\("([^"]+)"\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementTextEquals',
        values: { strategy: 'xpath', value: matches[1], text: matches[2] }
      })
    },
    {
      regex: /expect\(@driver\.find_element\(:xpath,\s*concat\((.+?)\)\)\.text\)\.to eq\("([^"]+)"\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementTextEquals',
        values: { strategy: 'xpath', value: matches[1], text: matches[2] }
      })
    }
  ]

  for (const pattern of patterns) {
    const match = command.match(pattern.regex)
    if (match) {
      return pattern.template(match)
    }
  }

  return command
}

export default xpathParser