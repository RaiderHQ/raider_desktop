export interface ParsedCommand {
  key: string
  values: Record<string, string>
}

/**
 * Translates a Selenium Ruby command string into a more human-readable format.
 * @param command The raw command string (e.g., '@driver.get("https://google.com")').
 * @returns A friendly, plain English string.
 */
const commandParser = (command: string): ParsedCommand | string => {
  const patterns: {
    regex: RegExp
    template: (matches: string[]) => ParsedCommand
  }[] = [
    {
      regex: /@driver\.get\("([^"]+)"\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.visit',
        values: { url: matches[1] }
      })
    },
    {
      regex:
        /wait\.until { @driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\.displayed\? }$/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.waitForElementDisplayed',
        values: { strategy: matches[1], value: matches[2] || matches[3] }
      })
    },
    {
      regex:
        /wait\.until { @driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\.enabled\? }/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.waitForElementEnabled',
        values: { strategy: matches[1], value: matches[2] || matches[3] }
      })
    },
    {
      regex: /@driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\.click/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.clickElement',
        values: { strategy: matches[1], value: matches[2] || matches[3] }
      })
    },
    {
      regex:
        /@driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\.send_keys\(:(\w+)\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.pressKey',
        values: { key: matches[4], strategy: matches[1], value: matches[2] || matches[3] }
      })
    },
    {
      regex:
        /@driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\.send_keys\("([^"]*)"\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.typeText',
        values: { text: matches[4], strategy: matches[1], value: matches[2] || matches[3] }
      })
    },
    {
      regex: /sleep\(([\d.]+)\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.wait',
        values: { seconds: matches[1] }
      })
    },
    {
      regex: /@driver\.execute_script\("([^"]+)"\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.executeScript',
        values: { script: matches[1] }
      })
    },
    {
      regex: /@driver\.switch_to\.frame\(([^)]+)\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.switchToFrame',
        values: { frame: matches[1] }
      })
    },
    {
      regex: /@driver\.switch_to\.default_content/,
      template: (): ParsedCommand => ({
        key: 'recorder.commandParser.switchToDefaultContent',
        values: {}
      })
    },
    {
      regex:
        /expect\(@driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\)\.to be_displayed$/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementDisplayed',
        values: { strategy: matches[1], value: matches[2] || matches[3] }
      })
    },
    {
      regex:
        /expect\(@driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\)\.to be_enabled/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementEnabled',
        values: { strategy: matches[1], value: matches[2] || matches[3] }
      })
    },
    {
      regex:
        /expect\(@driver\.find_element\(:?(\w+),\s*(?:%q\((.+?)\)|"((?:\\"|[^"])*)")\)\.text\)\.to eq\("([^"]+)"\)/,
      template: (matches: string[]): ParsedCommand => ({
        key: 'recorder.commandParser.assertElementTextEquals',
        values: { strategy: matches[1], value: matches[2] || matches[3], text: matches[4] }
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

export default commandParser
