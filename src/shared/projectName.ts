/**
 * A project name becomes a folder and a `raider new` argument: letters, numbers,
 * underscores and hyphens, starting with a letter or number (a leading hyphen would
 * read as an option, a leading dot or underscore would hide the folder).
 */
export const PROJECT_NAME_RULE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export const isValidProjectName = (name: string): boolean => PROJECT_NAME_RULE.test(name)
