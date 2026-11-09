/**
 * The names `raider g <type> <name> --path <folder>` takes from the Files tab, and the file
 * Ruby Raider 4.0.1 writes for them (its NameNormalizer and Scaffolding#default_path).
 */
/** The types the Files menu offers on a folder, in menu order. */
export const FOLDER_SCAFFOLD_TYPES = ['page', 'spec', 'component', 'helper'] as const

export type FolderScaffoldType = (typeof FOLDER_SCAFFOLD_TYPES)[number]

export const isFolderScaffoldType = (type: unknown): type is FolderScaffoldType =>
  FOLDER_SCAFFOLD_TYPES.includes(type as FolderScaffoldType)

// What the gem appends to the normalized name with --path
const SUFFIX: Record<FolderScaffoldType, string> = {
  page: '_page.rb',
  spec: '_spec.rb',
  helper: '_helper.rb',
  component: '.rb'
}

// The gem strips each of these once, in this order
const STRIPPED = ['_page', '_spec', '_helper', '_test']

const MAX_LENGTH = 100

/**
 * A Ruby-identifier-like name: a letter, then letters, digits or underscores. No paths, no
 * dots, nothing the shell or Thor could read as anything but the name.
 */
export const isScaffoldName = (name: unknown): name is string =>
  typeof name === 'string' && name.length <= MAX_LENGTH && /^[A-Za-z][A-Za-z0-9_]*$/.test(name)

/** NameNormalizer.normalize: snake case when it has capitals, then the suffixes stripped. */
function normalize(name: string): string {
  let result = /[A-Z]/.test(name)
    ? name
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .replace(/([a-z\d])([A-Z])/g, '$1_$2')
        .toLowerCase()
    : name
  for (const suffix of STRIPPED) {
    if (result.endsWith(suffix)) result = result.slice(0, -suffix.length)
  }
  return result
}

/** The file name `raider g <type> <name> --path <folder>` creates inside the folder. */
export function scaffoldFileName(type: FolderScaffoldType, name: string): string {
  return `${normalize(name)}${SUFFIX[type]}`
}
