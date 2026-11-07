/**
 * The tag names the UI accepts: bare Ruby symbols, starting with a letter. This is a subset of
 * what main's validateTags in runCommand.ts allows, which stays wider on purpose (shell safety
 * for tags typed elsewhere).
 */
export const TAG_RE = /^[a-z][a-z0-9_]*$/
