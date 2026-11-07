/** A tag is a lower-case Ruby-symbol-safe word, so it can sit in `describe 'x', :tag`. */
export const TAG_RE = /^[a-z][a-z0-9_]*$/

/** Strings only, trimmed, lower-cased, valid, unique and sorted; anything else is dropped. */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const out = new Set<string>()
  for (const item of input) {
    if (typeof item !== 'string') continue
    const tag = item.trim().toLowerCase()
    if (TAG_RE.test(tag)) out.add(tag)
  }
  return [...out].sort()
}

const DESCRIBE_HEAD = /^(\s*(?:RSpec\.)?describe)(\s*\(\s*|\s+)/

interface DescribeParts {
  /** Everything up to the first argument */
  prefix: string
  /** Top-level arguments, trimmed; the first is the description */
  args: string[]
  /** From the closing paren / `do` / `{` / comment on, with its leading space */
  suffix: string
}

/** Splits a `describe` line into its arguments, or null when it is not one. */
function parseDescribeLine(line: string): DescribeParts | null {
  const head = DESCRIBE_HEAD.exec(line)
  if (!head) return null
  const parenForm = head[2].includes('(')
  const args: string[] = []
  let current = ''
  let depth = 0
  let quote: string | null = null
  let i = head[0].length
  let end = line.length
  for (; i < line.length; i++) {
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
      const prev = current.trimEnd().slice(-1)
      if (c === '#' || (c === ')' && parenForm)) {
        end = i
        break
      }
      if (c === '{' && args.length + (current.trim() ? 1 : 0) > 0 && !/[:>,]/.test(prev)) {
        end = i
        break
      }
      if (c === 'd' && /^do\b/.test(line.slice(i)) && (i === 0 || /[\s)]/.test(line[i - 1]))) {
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
  if (current.trim()) args.push(current.trim())
  if (args.length === 0) return null
  const rest = line.slice(end)
  const suffix = /^(?:do\b|\{|#)/.test(rest) ? ` ${rest}` : rest
  return { prefix: head[1] + head[2], args, suffix }
}

const tagOf = (arg: string): string | null => {
  const m = /^:([A-Za-z_]\w*)$/.exec(arg) ?? /^(['"])([^'"\\#]*)\1$/.exec(arg)
  const raw = m ? (m.length === 2 ? m[1] : m[2]) : null
  if (raw === null) return null
  const tag = raw.trim().toLowerCase()
  return TAG_RE.test(tag) ? tag : null
}

/**
 * Tags in the RSpec metadata after the description of a `describe` line:
 * symbols and strings count, hash metadata like `type: :feature` does not.
 */
export function tagsFromDescribeLine(line: string): string[] {
  const parts = parseDescribeLine(line)
  if (!parts) return []
  return normalizeTags(parts.args.slice(1).map(tagOf))
}

/**
 * The `describe` line with its tag metadata replaced by `tags` (as symbols);
 * the description and any hash metadata stay. Null when `line` is not a describe line.
 */
export function describeLineWithTags(line: string, tags: string[]): string | null {
  const parts = parseDescribeLine(line)
  if (!parts) return null
  const [description, ...rest] = parts.args
  const kept = rest.filter((arg) => tagOf(arg) === null)
  const args = [description, ...normalizeTags(tags).map((t) => `:${t}`), ...kept]
  return `${parts.prefix}${args.join(', ')}${parts.suffix}`
}
