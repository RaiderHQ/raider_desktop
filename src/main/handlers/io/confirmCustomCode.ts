import { dialog, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { englishText } from '../../../shared/describeStepEnglish'
import type { Step } from '../../../shared/types/step'

const K = 'tests.importCustomCode'
// A message box doesn't scroll, so it shows whole lines up to these limits and says
// how many are hidden; "Show all code" opens the rest
const SHOWN_LINES = 40
const SHOWN_CHARS = 4000

export interface ImportedTest {
  name: string
  steps: Step[]
}

/**
 * Before importing tests whose steps hold custom Ruby, shows that code and asks to
 * confirm. Called on the final step list, whatever format it came from: the user picked
 * the file in a dialog and hasn't seen its body. True when there is no custom code, or
 * the user chose to import anyway.
 */
export async function confirmCustomCode(
  mainWindow: BrowserWindow,
  tests: ImportedTest[]
): Promise<boolean> {
  const withCode = tests
    .map((test) => ({
      name: test.name,
      code: test.steps.flatMap((step) => (step.kind === 'custom' ? [step.code] : []))
    }))
    .filter((test) => test.code.length > 0)
  if (withCode.length === 0) return true

  const listing = withCode.map((test) => `${test.name}:\n${test.code.join('\n')}`).join('\n\n')
  const lines = listing.split('\n')
  const shown: string[] = []
  let chars = 0
  for (const line of lines) {
    if (shown.length === SHOWN_LINES || chars + line.length > SHOWN_CHARS) break
    shown.push(line)
    chars += line.length + 1
  }
  const truncated = shown.length < lines.length

  // The note goes above the code, where a long listing can't push it out of view
  const intro = englishText(`${K}.detail`)
  const note = truncated
    ? `\n${englishText(`${K}.truncated`, { shown: String(shown.length), total: String(lines.length) })}`
    : ''
  const buttons = [englishText(`${K}.confirm`)]
  if (truncated) buttons.push(englishText(`${K}.showAll`))
  buttons.push(englishText(`${K}.cancel`))
  const cancelId = buttons.length - 1

  for (;;) {
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      message: englishText(withCode.length === 1 ? `${K}.one` : `${K}.many`),
      detail: `${intro}${note}\n\n${shown.join('\n')}`,
      buttons,
      defaultId: cancelId,
      cancelId
    })
    if (response !== 1 || !truncated) return response === 0
    await showAllCode(listing)
  }
}

// Plain text, never .rb: opening it must show the code, not run it
async function showAllCode(listing: string): Promise<void> {
  const file = join(tmpdir(), `raider-import-code-${randomUUID()}.txt`)
  await writeFile(file, listing, 'utf-8')
  await shell.openPath(file)
}

export const importCancelled = (): string => englishText(`${K}.cancelled`)

/** Why an import was refused: a secret step reads a variable that isn't RAIDER_SECRET_. */
export const secretRefused = (name: string): string =>
  englishText(`${K}.secretNameRefused`, { name })
