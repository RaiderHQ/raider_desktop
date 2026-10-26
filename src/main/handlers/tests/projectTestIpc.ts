import { appState } from '../appState'
import { activationSettled } from '../project/setActiveProject'
import { runSpecFiles } from '../testing/runSpecFiles'
import { listProjectTests } from './listProjectTests'
import { assertSpecFile, readCodeTest } from './readCodeTest'
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
async function listedFile(file: unknown): Promise<{ projectPath: string; file: string }> {
  await activationSettled()
  const { projectPath, layout } = appState
  if (!projectPath || !layout) throw new Error(NO_PROJECT)
  if (typeof file !== 'string') throw new Error('Not a spec file')
  const listed = await listProjectTests(projectPath, layout)
  if (!listed.some((entry) => entry.file === file)) throw new Error(`Not a project test: ${file}`)
  return { projectPath, file }
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
    const result = await runSpecFiles(target.projectPath, [target.file], rubyCommand)
    if (result.exitCode !== 0 && result.stderr) {
      return {
        success: false,
        output: `Test execution failed.\n\n--- STDERR ---\n${result.stderr}\n\n--- STDOUT ---\n${result.stdout}`
      }
    }
    return { success: true, output: result.stdout }
  } catch (error) {
    return { success: false, output: error instanceof Error ? error.message : String(error) }
  }
}
