import fs from 'fs/promises'
import { randomUUID } from 'crypto'
import { posix } from 'path'
import { migrateLegacySteps } from '../../codegen/legacy'
import { assertRealInside, isSafeRelPath, resolveInside } from './sidecar'
import type { CodeTestView } from '../../../shared/types/projectTest'
import type { Step } from '../../../shared/types/step'

const IT = /^(\s*)(?:it|specify|scenario)\s*\(?\s*(['"])(.+?)\2[^\n]*?\bdo\b/
const isCode = (line: string): boolean => line.trim() !== '' && !line.trim().startsWith('#')

/**
 * The one guard for opening or running a spec by relative path: a safe
 * `_spec.rb` path, really inside the project (symlinks resolved), and a regular
 * file. Returns the absolute path.
 */
export async function assertSpecFile(projectPath: string, fileRel: string): Promise<string> {
  if (!isSafeRelPath(fileRel) || !fileRel.endsWith('_spec.rb'))
    throw new Error(`Not a spec file: ${fileRel}`)
  const target = resolveInside(projectPath, fileRel)
  await assertRealInside(projectPath, target)
  // Never open a FIFO or device: reading it could block forever
  if (!(await fs.stat(target)).isFile()) throw new Error(`Not a regular file: ${fileRel}`)
  return target
}

/**
 * Best-effort, read-only view of a hand-written spec: each `it` block becomes
 * an example whose lines are shown as friendly steps (unknown lines as custom).
 */
export async function readCodeTest(projectPath: string, fileRel: string): Promise<CodeTestView> {
  const target = await assertSpecFile(projectPath, fileRel)
  const lines = (await fs.readFile(target, 'utf-8')).split(/\r?\n/)

  const examples: CodeTestView['examples'] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(IT)
    if (!m) continue
    const indent = m[1]
    const body: string[] = []
    let j = i + 1
    while (
      j < lines.length &&
      !(lines[j].startsWith(`${indent}end`) && /^end\b/.test(lines[j].slice(indent.length)))
    ) {
      body.push(lines[j])
      j++
    }
    examples.push({
      name: m[3],
      steps: migrateLegacySteps(body.filter(isCode).map((l) => l.trim()))
    })
    i = j
  }

  if (examples.length === 0) {
    const steps: Step[] = lines
      .filter(isCode)
      .map((l) => ({ id: randomUUID(), kind: 'custom' as const, code: l.trim() }))
    examples.push({ name: posix.basename(fileRel), steps })
  }
  return { file: fileRel, examples }
}
