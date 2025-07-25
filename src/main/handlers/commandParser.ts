/**
 * Translates a Selenium Ruby command string into a more human-readable format.
 * @param command The raw command string (e.g., '@driver.get("https://google.com")').
 * @returns A friendly, plain English string.
 */
const commandParser = (command: string): string => {
  const patterns = [
    {
      regex: /@driver\.get\("([^"]+)"\)/,
      template: (matches: string[]): string => `Visit ${matches[1]}`
    },
    {
      regex: /wait\.until { @driver\.find_element\(:?(\w+),\s*"([^"]+)"\)\.displayed\? }/,
      template: (matches: string[]): string =>
        `Wait for element with ${matches[1]} "${matches[2]}" to be displayed`
    },
    {
      regex: /wait\.until { @driver\.find_element\(:?(\w+),\s*"([^"]+)"\)\.enabled\? }/,
      template: (matches: string[]): string =>
        `Wait for element with ${matches[1]} "${matches[2]}" to be enabled`
    },
    {
      regex: /@driver\.find_element\(:?(\w+),\s*"([^"]+)"\)\.click/,
      template: (matches: string[]): string => `Click element with ${matches[1]} "${matches[2]}"`
    },
    {
      regex: /@driver\.find_element\(:?(\w+),\s*"([^"]+)"\)\.send_keys\(:(\w+)\)/,
      template: (matches: string[]): string =>
        `Press the ${matches[3]} key on element with ${matches[1]} "${matches[2]}"`
    },
    {
      regex: /@driver\.find_element\(:?(\w+),\s*"([^"]+)"\)\.send_keys\("([^"]*)"\)/,
      template: (matches: string[]): string =>
        `Type "${matches[3]}" into element with ${matches[1]} "${matches[2]}"`
    },
    {
      regex: /sleep\(([\d.]+)\)/,
      template: (matches: string[]): string => `Wait for ${matches[1]} seconds`
    },
    {
      regex: /@driver\.execute_script\("([^"]+)"\)/,
      template: (matches: string[]): string => `Execute script: ${matches[1]}`
    },
    {
      regex: /@driver\.switch_to\.frame\(([^)]+)\)/,
      template: (matches: string[]): string => `Switch to frame identified by ${matches[1]}`
    },
    {
      regex: /@driver\.switch_to\.default_content/,
      template: (): string => 'Switch back to main content'
    },
    {
      regex: /expect\(@driver\.find_element\(:?(\w+),\s*"([^"]+)"\)\)\.to be_displayed/,
      template: (matches: string[]): string =>
        `Assert that element with ${matches[1]} "${matches[2]}" is displayed`
    },
    {
      regex: /expect\(@driver\.find_element\(:?(\w+),\s*"([^"]+)"\)\)\.to be_enabled/,
      template: (matches: string[]): string =>
        `Assert that element with ${matches[1]} "${matches[2]}" is enabled`
    },
    {
      regex: /expect\(@driver\.find_element\(:?(\w+),\s*"([^"]+)"\)\.text\)\.to eq\("([^"]+)"\)/,
      template: (matches: string[]): string =>
        `Assert that element with ${matches[1]} "${matches[2]}" has text equal to "${matches[3]}"`
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
