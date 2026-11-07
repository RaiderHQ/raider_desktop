/** A tag is a lower-case Ruby-symbol-safe word, so it can sit in `describe 'x', :tag`. */
export const TAG_RE = /^[a-z][a-z0-9_]*$/

export const MAX_TAGS = 20
export const MAX_TAG_LENGTH = 40

/**
 * Strings only, trimmed, lower-cased, valid (and at most 40 characters), unique
 * and sorted; anything else is dropped. At most MAX_TAGS are kept.
 */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'string') continue
    const tag = item.trim().toLowerCase()
    if (tag.length <= MAX_TAG_LENGTH && TAG_RE.test(tag)) out.add(tag)
  }
  return [...out].sort().slice(0, MAX_TAGS)
}

// The first argument must be a string, a constant or a symbol: `describe = x` is not a call
const DESCRIBE_HEAD = /^(\s*(?:RSpec\.)?describe)(\s*\(\s*|\s+)(?=['"A-Z:])/

interface DescribeParts {
  /** Everything up to the first argument */
  prefix: string
  /** Top-level arguments, trimmed; the first is the description */
  args: string[]
  /** From the closing paren / `do` / `{` on, with its leading space */
  suffix: string
}

/**
 * Splits a one-line `describe` call into its arguments. Null when it is not
 * one, or when the call is not complete on this line (a trailing comma, an
 * open paren or quote, a comment before the block, no `do` or `{`).
 */
function parseDescribeLine(line: string): DescribeParts | null {
  if (line.includes('\n')) return null
  const head = DESCRIBE_HEAD.exec(line)
  if (!head) return null
  const parenForm = head[2].includes('(')
  const args: string[] = []
  let current = ''
  let depth = 0
  let quote: string | null = null
  let end = -1
  for (let i = head[0].length; i < line.length; i++) {
    const c = line[i]
    if (quote) {
      current += c
      if (c === '\\' && i + 1 < line.length) current += line[++i]
      else if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      current += c
      continue
    }
    if (depth === 0) {
      if (c === '#') return null
      if (c === ')' && parenForm) {
        if (!/^\)\s*(?:do\b|\{)/.test(line.slice(i))) return null
        end = i
        break
      }
      const prev = current.trimEnd().slice(-1)
      if (c === '{' && (args.length > 0 || current.trim()) && !/[:>,]/.test(prev)) {
        end = i
        break
      }
      if (!parenForm && c === 'd' && /^do\b/.test(line.slice(i)) && /[\s)]/.test(line[i - 1])) {
        end = i
        break
      }
      if (c === ',') {
        args.push(current.trim())
        current = ''
        continue
      }
    }
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    current += c
  }
  if (end === -1 || quote || depth !== 0) return null
  // `describe 'x', do` or a comma left at the end: the arguments go on
  if (!current.trim()) return null
  args.push(current.trim())
  const rest = line.slice(end)
  const suffix = /^(?:do\b|\{)/.test(rest) ? ` ${rest}` : rest
  return { prefix: head[1] + head[2], args, suffix }
}

const HASH_ARG = /^(?:[A-Za-z_]\w*[?!]?:(?!:)|(['"]).*\1:|\*\*|.*=>)/
const isHashArg = (arg: string): boolean => HASH_ARG.test(arg)

const symbolTag = (arg: string): string | null => {
  const name = /^:([a-z][a-z0-9_]*)$/.exec(arg)?.[1]
  return name !== undefined && name.length <= MAX_TAG_LENGTH ? name : null
}

/** Splits arguments after the description as RSpec reads them: positional, trailing :symbols, hash. */
function splitArgs(args: string[]): { positional: string[]; tags: string[]; hash: string[] } {
  const rest = args.slice(1)
  let hashStart = rest.length
  while (hashStart > 0 && isHashArg(rest[hashStart - 1])) hashStart--
  const hash = rest.slice(hashStart)
  const body = rest.slice(0, hashStart)
  let tagStart = body.length
  while (tagStart > 0 && symbolTag(body[tagStart - 1]) !== null) tagStart--
  return {
    positional: body.slice(0, tagStart),
    tags: body.slice(tagStart).map((a) => symbolTag(a) as string),
    hash
  }
}

/**
 * Tags in a `describe` line: the trailing `:symbol` arguments before an
 * optional final hash, as RSpec reads metadata. Strings belong to the
 * description, and `type: :feature` is hash metadata, not a tag.
 */
export function tagsFromDescribeLine(line: string): string[] {
  const parts = parseDescribeLine(line)
  return parts ? normalizeTags(splitArgs(parts.args).tags) : []
}

/**
 * The `describe` line with its trailing tag symbols replaced by `tags`. The
 * description and other arguments stay in place, the new tags follow them and
 * any hash comes last. Null when `line` is not a describe call that is
 * complete on this line.
 */
export function describeLineWithTags(line: string, tags: string[]): string | null {
  const parts = parseDescribeLine(line)
  if (!parts) return null
  const { positional, hash } = splitArgs(parts.args)
  const args = [parts.args[0], ...positional, ...normalizeTags(tags).map((t) => `:${t}`), ...hash]
  return `${parts.prefix}${args.join(', ')}${parts.suffix}`
}

const HEREDOC = /<<([~-]?)(['"]?)([A-Za-z_]\w*)\2/

/**
 * The first line that starts a `describe` call, skipping comments, `=begin`
 * blocks and heredoc bodies. `index` is the line's offset in `content`.
 */
export function findDescribeLine(content: string): { line: string; index: number } | null {
  let index = 0
  let inBlockComment = false
  let heredoc: { id: string; indented: boolean } | null = null
  for (const line of content.split('\n')) {
    const here = index
    index += line.length + 1
    const bare = line.replace(/\r$/, '')
    if (inBlockComment) {
      if (bare.startsWith('=end')) inBlockComment = false
      continue
    }
    if (heredoc) {
      if ((heredoc.indented ? bare.trim() : bare) === heredoc.id) heredoc = null
      continue
    }
    if (bare.startsWith('=begin')) {
      inBlockComment = true
      continue
    }
    if (DESCRIBE_HEAD.test(line)) return { line, index: here }
    const doc = HEREDOC.exec(line)
    if (doc) heredoc = { id: doc[3], indented: doc[1] !== '' }
  }
  return null
}
