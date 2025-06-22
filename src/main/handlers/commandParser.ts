// src/utils/commandParser.ts

/**
 * Translates a Selenium Ruby command string into a more human-readable format.
 * @param command The raw command string (e.g., '@driver.get("https://google.com")').
 * @returns A friendly, plain English string.
 */
const commandParser = (command: string): string => {
  // A list of patterns to match against. More can be added here.
  const patterns = [
    {
      regex: /@driver\.get\("([^"]+)"\)/,
      template: (matches: string[]) => `Visit ${matches[1]}`,
    },
    {
      regex: /@driver\.find_element\(:?(\w+),\s*"([^"]+)"\)\.click/,
      template: (matches: string[]) => `Click element with ${matches[1]} "${matches[2]}"`,
    },
    {
      regex: /@driver\.find_element\(:?(\w+),\s*"([^"]+)"\)\.send_keys\("([^"]*)"\)/,
      template: (matches: string[]) => `Type "${matches[3]}" into element with ${matches[1]} "${matches[2]}"`,
    },
    {
      regex: /sleep\(([\d.]+)\)/,
      template: (matches: string[]) => `Wait for ${matches[1]} seconds`,
    },
    {
      regex: /@driver\.execute_script\("([^"]+)"\)/,
      template: (matches: string[]) => `Execute script: ${matches[1]}`,
    },
    {
      regex: /@driver\.switch_to\.frame\(([^)]+)\)/,
      template: (matches: string[]) => `Switch to frame identified by ${matches[1]}`,
    },
    {
      regex: /@driver\.switch_to\.default_content/,
      template: () => 'Switch back to main content',
    },
  ];

  for (const pattern of patterns) {
    const match = command.match(pattern.regex);
    if (match) {
      return pattern.template(match);
    }
  }

  // If no pattern matches, return the original command.
  return command;
};

export default commandParser;
