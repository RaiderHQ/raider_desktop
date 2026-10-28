import fs from 'fs/promises'
import { renderStep } from '../../codegen/steps'
import { locateExamples } from './exampleLocator'
import { assertSpecFile } from './readCodeTest'
import {
  readSidecar,
  serialize,
  SidecarUnreadableError,
  writeFileAtomic,
  writeSidecar
} from './sidecar'
import type { Sidecar } from '../../../shared/types/projectTest'
import type { ProjectLayout } from '../../../shared/types/projectLayout'
import type { Step } from '../../../shared/types/step'

/** The example name matched `count` blocks instead of exactly one. */
export class ExampleNotUniqueError extends Error {
  constructor(readonly count: number) {
    super(
      count === 0 ? 'No example has that name.' : `${count} examples have that name, expected one.`
    )
    this.name = 'ExampleNotUniqueError'
  }
}

// Selenium steps read `wait`; a spec without its own uses the project's configured wait
const LOCAL_WAIT =
  "wait = Selenium::WebDriver::Wait.new(timeout: YAML.load_file('config/config.yml').fetch('explicit_wait', 10))"
const DEFINES_WAIT = /\blet!?[(\s]\s*:wait\b|\bdef\s+wait\b/
const STRING_LITERAL = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g
const DO_HEADER = /\bdo\s*(?:\|[^|]*\|)?\s*(?:#.*)?$/

/**
 * Where the block opens on a header line: the first `{` or `do` outside
 * strings and parentheses. Used only to rewrite a brace or one-line block.
 */
function openerIndex(header: string): number {
  let depth = 0
  for (let i = 0; i < header.length; i++) {
    const c = header[i]
    if (c === "'" || c === '"') {
      for (i++; i < header.length && header[i] !== c; i++) if (header[i] === '\\') i++
    } else if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (depth === 0 && c === '{') return i
    else if (depth === 0 && /^do\b/.test(header.slice(i)) && !/\w/.test(header[i - 1] ?? ''))
      return i
  }
  throw new Error('Could not find where the example starts.')
}

// Per spec file, so two replaces on one file can't read and write over each other
const fileQueues = new Map<string, Promise<unknown>>()

/**
 * Replaces the body of the one example named `exampleName` in a spec file with
 * `steps`, keeping every other byte of the file. A code-owned sidecar takes
 * the new steps too.
 */
export async function replaceExample(
  projectPath: string,
  layout: ProjectLayout,
  fileRel: string,
  exampleName: string,
  steps: Step[],
  rubyCommand: string
): Promise<void> {
  const key = `${await fs.realpath(projectPath)}\0${fileRel}`
  return serialize(fileQueues, key, async () => {
    const target = await assertSpecFile(projectPath, fileRel)
    const ranges = await locateExamples(projectPath, target, exampleName, rubyCommand)
    if (ranges.length !== 1) throw new ExampleNotUniqueError(ranges.length)
    const { startLine, endLine } = ranges[0]

    const source = await fs.readFile(target, 'utf-8')
    const eol = source.includes('\r\n') ? '\r\n' : '\n'
    const lines = source.split(eol)
    const header = lines[startLine - 1]
    const indent = header.match(/^\s*/)![0]

    // A multi-line do block keeps its header and `end`; anything else becomes one
    const keep = endLine > startLine && DO_HEADER.test(header)
    const open = keep ? header : `${header.slice(0, openerIndex(header)).trimEnd()} do`
    const close = keep ? lines[endLine - 1] : `${indent}end`

    const body = steps.flatMap((step) =>
      renderStep(step, layout.automation, { receiver: 'helper' }).split('\n')
    )
    const usesWait = body.some((line) => /\bwait\b/.test(line.replace(STRING_LITERAL, "''")))
    if (layout.automation === 'selenium' && usesWait && !DEFINES_WAIT.test(source))
      body.unshift(LOCAL_WAIT)
    const inner = body.map((line) => (line === '' ? line : `${indent}  ${line}`))

    const next = [...lines.slice(0, startLine - 1), open, ...inner, close, ...lines.slice(endLine)]
    await writeFileAtomic(target, next.join(eol))

    let sidecar: Sidecar | null = null
    try {
      sidecar = await readSidecar(projectPath, fileRel)
    } catch (error) {
      // An unreadable sidecar is reported by the tests list; the file is already saved
      if (!(error instanceof SidecarUnreadableError)) throw error
    }
    if (sidecar?.codeOwned)
      await writeSidecar(projectPath, { ...sidecar, steps, updatedAt: new Date().toISOString() })
  })
}
