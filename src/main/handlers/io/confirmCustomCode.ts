import { dialog, BrowserWindow } from 'electron'
import { englishText } from '../../../shared/describeStepEnglish'
import type { Step } from '../../../shared/types/step'

const K = 'tests.importCustomCode'
// A message box can't scroll far, and the point is to show what would run, not all of it
const DETAIL_MAX = 4000

export interface ImportedTest {
  name: string
  steps: Step[]
  /** The steps came from the hidden JSON line, so the Ruby shown in the file isn't what runs */
  fromJson: boolean
}

/**
 * Before importing tests whose hidden steps hold custom Ruby, shows that code and asks
 * to confirm. True when there is none, or the user chose to import anyway.
 */
export async function confirmCustomCode(
  mainWindow: BrowserWindow,
  tests: ImportedTest[]
): Promise<boolean> {
  const withCode = tests
    .filter((test) => test.fromJson)
    .map((test) => ({
      name: test.name,
      code: test.steps.flatMap((step) => (step.kind === 'custom' ? [step.code] : []))
    }))
    .filter((test) => test.code.length > 0)
  if (withCode.length === 0) return true

  const listing = withCode.map((test) => `${test.name}:\n${test.code.join('\n')}`).join('\n\n')
  const detail = `${englishText(`${K}.detail`)}\n\n${listing}`
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    message: englishText(withCode.length === 1 ? `${K}.one` : `${K}.many`),
    detail: detail.length > DETAIL_MAX ? `${detail.slice(0, DETAIL_MAX)}\n…` : detail,
    buttons: [englishText(`${K}.confirm`), englishText(`${K}.cancel`)],
    defaultId: 1,
    cancelId: 1
  })
  return response === 0
}

export const importCancelled = (): string => englishText(`${K}.cancelled`)
