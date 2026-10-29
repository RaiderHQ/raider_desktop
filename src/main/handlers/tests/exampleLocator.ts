import fs from 'fs/promises'
import { safeExec } from '../../utils/safeExec'
import { buildShellCommand } from '../../utils/shellCommand'
import { quoteShellArg } from '../../utils/shellQuote'
import { isValidRubyCommand } from '../../utils/rubyCommand'

/** 1-based, inclusive: the `it` line through the line holding its closing `end` or `}`. */
export type ExampleRange = { startLine: number; endLine: number }

// Ruby's own parser finds the blocks, so heredocs, nested blocks and strings
// containing `end` can't fool it. Only literal names match: `it "a #{b}"` is a
// DSTR node, never a STR, so an interpolated name is not found.
const SCRIPT = `
require 'json'
NAMES = %i[it specify scenario].freeze
# Read as UTF-8 whatever the locale: an app started from Finder often has no LANG
name = ARGV[1].dup.force_encoding('UTF-8')
found = []
walk = lambda do |node|
  next unless node.is_a?(RubyVM::AbstractSyntaxTree::Node)
  if node.type == :ITER
    call = node.children[0]
    if %i[FCALL CALL].include?(call.type)
      mid, args = call.type == :FCALL ? call.children : call.children[1..2]
      first = args&.type == :LIST ? args.children[0] : nil
      if NAMES.include?(mid) && first&.type == :STR && first.children[0] == name
        found << { startLine: node.first_lineno, endLine: node.last_lineno }
      end
    end
  end
  node.children.each { |child| walk.call(child) }
end
walk.call(RubyVM::AbstractSyntaxTree.parse(File.read(ARGV[0], encoding: 'UTF-8')))
puts JSON.generate(found)
`

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// A name with quotes or backslashes may be spelled with escapes in the source,
// so the text pre-check could miss it; such names always go to Ruby.
function surelyAbsent(source: string, name: string): boolean {
  if (/['"\\]/.test(name)) return false
  const line = new RegExp(`^\\s*(?:\\S+\\.)?(?:it|specify|scenario)\\b.*${escapeRegExp(name)}`, 'm')
  return !line.test(source)
}

/**
 * Every `it` / `specify` / `scenario` block in `absFile` whose name is the
 * literal string `name`. The caller guards the path.
 */
export async function locateExamples(
  projectPath: string,
  absFile: string,
  name: string,
  rubyCommand: string
): Promise<ExampleRange[]> {
  if (!isValidRubyCommand(rubyCommand)) throw new Error('The Ruby command is not valid.')
  if (surelyAbsent(await fs.readFile(absFile, 'utf-8'), name)) return []

  const command = `${rubyCommand} -e ${quoteShellArg(SCRIPT)} ${quoteShellArg(absFile)} ${quoteShellArg(name)}`
  const result = await safeExec(buildShellCommand(projectPath, command), {
    cwd: projectPath,
    timeout: 20_000
  })
  if (result.exitCode !== 0) throw new Error(`Could not read the spec file: ${result.stderr}`)
  return JSON.parse(result.stdout) as ExampleRange[]
}
