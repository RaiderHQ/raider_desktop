import { readFile, stat } from 'fs/promises'
import { join } from 'path'

import type { ProjectLayout } from '@shared/types/projectLayout'

// An active `config.include(WaitHelper)` / `config.include WaitHelper` line
const INCLUDE_WAIT_HELPER = /^\s*config\.include[\s(]+WaitHelper\b/

/**
 * Ruby Raider 3.12 projects ship helpers/wait_helper.rb and include WaitHelper in
 * spec_helper.rb. False when either is missing or can't be read.
 */
export async function detectWaitHelper(projectPath: string, helperPath: string): Promise<boolean> {
  try {
    if (!(await stat(join(projectPath, helperPath, 'wait_helper.rb'))).isFile()) return false
    const specHelper = await readFile(join(projectPath, helperPath, 'spec_helper.rb'), 'utf-8')
    return specHelper
      .split('\n')
      .some((line) => !line.trimStart().startsWith('#') && INCLUDE_WAIT_HELPER.test(line))
  } catch {
    return false
  }
}

/** Whether specs for this project are written with the wait helper: Selenium + RSpec + helper detected. */
export async function usesWaitHelper(
  projectPath: string,
  layout: Pick<ProjectLayout, 'automation' | 'framework' | 'helperPath'>
): Promise<boolean> {
  return (
    layout.automation === 'selenium' &&
    layout.framework === 'rspec' &&
    (await detectWaitHelper(projectPath, layout.helperPath))
  )
}
