import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { runSpecFiles, toRunResult } from '../testing/runSpecFiles'
import { listProjectTests } from './listProjectTests'
import { assertSpecFile, readCodeTest } from './readCodeTest'
import { ExampleNotUniqueError, replaceExample } from './replaceExample'
import { isStep } from '../../../shared/types/step'
import type { CodeTestView, ProjectTestEntry } from '../../../shared/types/projectTest'
import type { ProjectLayout } from '../../../shared/types/projectLayout'

type RunResult = { success: boolean; output: string }

const NO_PROJECT = 'No project is open.'

/** 'list-project-tests': the active project's spec files, once activation has finished. */
export async function listProjectTestsHandler(): Promise<ProjectTestEntry[]> {
  await activationSettled()
  const { projectPath, layout } = appState
  if (!projectPath || !layout) return []
  return listProjectTests(projectPath, layout)
}

/** 'get-project-layout' */
export async function getProjectLayoutHandler(): Promise<ProjectLayout | null> {
  await activationSettled()
  return appState.projectPath ? appState.layout : null
}

// Only a file the scanner lists may be opened or run, never an arbitrary path
export async function listedFile(
  file: unknown
): Promise<{ projectPath: string; layout: ProjectLayout; file: string }> {
  const { projectPath, layout, files } = await listedFiles([file])
  return { projectPath, layout, file: files[0] }
}

/** listedFile for several files against a single scan of the project. */
export async function listedFiles(
  files: unknown[]
): Promise<{ projectPath: string; layout: ProjectLayout; files: string[] }> {
  await activationSettled()
  const { projectPath, layout } = appState
  if (!projectPath || !layout) throw new Error(NO_PROJECT)
  for (const file of files) if (typeof file !== 'string') throw new Error('Not a spec file')
  const listed = new Set((await listProjectTests(projectPath, layout)).map((entry) => entry.file))
  for (const file of files as string[]) {
    if (!listed.has(file)) throw new Error(`Not a project test: ${file}`)
  }
  return { projectPath, layout, files: files as string[] }
}

/** 'open-code-test': the read-only view of a listed spec file. */
export async function openCodeTestHandler(file: string): Promise<CodeTestView> {
  const target = await listedFile(file)
  return readCodeTest(target.projectPath, target.file)
}

/** 'run-project-file': runs one listed spec file from the project, like run-test does. */
export async function runProjectFileHandler(file: string, rubyCommand: string): Promise<RunResult> {
  try {
    const target = await listedFile(file)
    await assertSpecFile(target.projectPath, target.file)
    return toRunResult(await runSpecFiles(target.projectPath, [target.file], rubyCommand))
  } catch (error) {
    return { success: false, output: error instanceof Error ? error.message : String(error) }
  }
}

type RecordOverResult =
  | { success: true }
  | { success: false; error: 'notUnique'; count: number }
  | { success: false; error: string }

/** 'record-over-example': replaces one named example of a listed spec file with `steps`. */
export async function recordOverExampleHandler(
  file: string,
  exampleName: string,
  steps: unknown,
  rubyCommand: string
): Promise<RecordOverResult> {
  try {
    const target = await listedFile(file)
    if (typeof exampleName !== 'string') throw new Error('No example name was given.')
    if (!Array.isArray(steps) || !steps.every(isStep)) throw new Error('The steps are not valid.')
    await replaceExample(
      target.projectPath,
      target.layout,
      target.file,
      exampleName,
      steps,
      rubyCommand
    )
    return { success: true }
  } catch (error) {
    if (error instanceof ExampleNotUniqueError)
      return { success: false, error: 'notUnique', count: error.count }
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}
