import { readFile } from 'fs/promises'
import { join } from 'path'

// An active `config.include(WaitHelper)` / `config.include WaitHelper` line
const INCLUDE_WAIT_HELPER = /^\s*config\.include[\s(]+WaitHelper\b/

/**
 * Ruby Raider 3.12 projects ship helpers/wait_helper.rb and include WaitHelper in
 * spec_helper.rb. False when either is missing or can't be read.
 */
export async function detectWaitHelper(projectPath: string, helperPath: string): Promise<boolean> {
  try {
    await readFile(join(projectPath, helperPath, 'wait_helper.rb'), 'utf-8')
    const specHelper = await readFile(join(projectPath, helperPath, 'spec_helper.rb'), 'utf-8')
    return specHelper
      .split('\n')
      .some((line) => !line.trimStart().startsWith('#') && INCLUDE_WAIT_HELPER.test(line))
  } catch {
    return false
  }
}
