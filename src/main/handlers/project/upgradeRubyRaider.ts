import { readFile, stat } from 'fs/promises'
import { join } from 'path'
import { appState } from '../appState'
import { isValidRubyCommand } from '../../utils/rubyCommand'
import { safeExec } from '../../utils/safeExec'
import { writeFileAtomic } from '../tests/sidecar'
import setActiveProject, { activationSettled } from './setActiveProject'
import type { UpgradeResult } from '../../../shared/types/upgradeResult'

/** The active `gem 'ruby_raider', '<requirement>'` line of a Gemfile, requirement captured. */
export const PIN_LINE = /^([ \t]*gem[ \t]+(['"])ruby_raider\2[ \t]*,[ \t]*)(['"])[^'"\n]*\3/m
/** A `gem 'ruby_raider'` line with no requirement: an option (`, require: false`, `, :require => false`), a comment, a continuation comma or the end may follow. */
const BARE_LINE =
  /^([ \t]*gem[ \t]+(['"])ruby_raider\2)(?=[ \t]*(?:,[ \t]*\w+:|,[ \t]*:\w+[ \t]*=>|,[ \t]*$|#|$))/m
/** A second requirement string after the pin (`'>= 3', '< 4'`): not a shape one repin can fix. */
const SECOND_REQUIREMENT = /^[ \t]*,[ \t]*['"]/

export const RUNTIME_PIN = '~> 4.0'

const GEMFILE_LIMIT = 1024 * 1024

/** Why a Gemfile cannot be repinned by the one-line edit. */
export type RepinRefusal = 'noLine' | 'severalRequirements'

/**
 * The Gemfile with its ruby_raider pin set to the 4.0 runtime, or why it cannot be: no
 * `gem 'ruby_raider'` line, or a pin with more than one requirement string.
 */
export function repinGemfile(text: string): string | RepinRefusal {
  const lines = text.split('\n')
  const active = (line: string): boolean => !line.trimStart().startsWith('#')
  const pinned = lines.findIndex((line) => active(line) && PIN_LINE.test(line))
  if (pinned !== -1) {
    // What follows the pin on its line, without a trailing comment
    const rest = lines[pinned].replace(PIN_LINE, '').replace(/#.*$/, '')
    const next = lines[pinned + 1] ?? ''
    const continued = /^[ \t]*,[ \t]*$/.test(rest) && /^[ \t]*['"]/.test(next)
    if (SECOND_REQUIREMENT.test(rest) || continued) return 'severalRequirements'
    lines[pinned] = lines[pinned].replace(PIN_LINE, (_m, head: string, _q, quote: string) => {
      return `${head}${quote}${RUNTIME_PIN}${quote}`
    })
    return lines.join('\n')
  }
  // No requirement: the lock alone held it back, so the line gets one
  const bare = lines.findIndex((line) => active(line) && BARE_LINE.test(line))
  if (bare === -1) return 'noLine'
  // A bare line ending in a comma whose next line is a requirement string is a continued pin
  const after = lines[bare].replace(BARE_LINE, '').replace(/#.*$/, '')
  if (/^[ \t]*,[ \t]*$/.test(after) && /^[ \t]*['"]/.test(lines[bare + 1] ?? '')) {
    return 'severalRequirements'
  }
  lines[bare] = lines[bare].replace(BARE_LINE, (_m, head: string, quote: string) => {
    return `${head}, ${quote}${RUNTIME_PIN}${quote}`
  })
  return lines.join('\n')
}

/**
 * Moves the open project to ruby_raider 4.0: the Gemfile pin becomes `~> 4.0` and
 * `bundle update ruby_raider` runs in the project, with the Ruby the app itself chose.
 * Only the open project can be updated, and only after the user confirmed in the renderer.
 * On success the project is activated again, so its layout and recorded tests are current.
 */
// One update at a time: a second click while bundle runs gets a refusal, not a second bundle
let inFlight: Promise<UpgradeResult> | null = null

export function upgradeRubyRaider(
  projectPath: unknown,
  rubyCommand: unknown
): Promise<UpgradeResult> {
  if (inFlight) return Promise.resolve({ success: false, error: 'An update is already running.' })
  inFlight = run(projectPath, rubyCommand).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function run(projectPath: unknown, rubyCommand: unknown): Promise<UpgradeResult> {
  await activationSettled()
  if (typeof projectPath !== 'string' || projectPath !== appState.projectPath) {
    return { success: false, error: 'Only the open project can be updated.' }
  }
  if (!isValidRubyCommand(rubyCommand)) return { success: false, error: 'Invalid Ruby command.' }
  const gemfilePath = join(projectPath, 'Gemfile')
  let gemfile: string
  try {
    gemfile = await readFile(gemfilePath, 'utf-8')
  } catch {
    return { success: false, error: 'The project has no Gemfile.' }
  }
  if (gemfile.length > GEMFILE_LIMIT) return { success: false, error: 'The Gemfile is too large.' }
  const repinned = repinGemfile(gemfile)
  if (repinned === 'noLine') {
    return { success: false, error: "The Gemfile has no gem 'ruby_raider' line to update." }
  }
  if (repinned === 'severalRequirements') {
    return {
      success: false,
      error:
        "The Gemfile pins ruby_raider with more than one requirement. Change it to '~> 4.0' by hand, then run bundle update ruby_raider."
    }
  }
  if (repinned !== gemfile) {
    // Keep the file's own permissions: writeFileAtomic writes a private temp file otherwise
    const mode = (await stat(gemfilePath)).mode & 0o7777
    await writeFileAtomic(gemfilePath, repinned, { mode })
  }

  const result = await safeExec(`${rubyCommand} -S bundle update ruby_raider`, {
    cwd: projectPath,
    timeout: 300_000
  })
  if (result.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim()
    return {
      success: false,
      error:
        result.exitCode === null
          ? 'bundle update ruby_raider timed out. Run it in the project folder.'
          : detail || `bundle update ruby_raider failed (exit code ${result.exitCode}).`,
      output: result.stdout
    }
  }
  // Whoever is in the project now: the reload rewrites the recorded tests for 4.0
  if (appState.projectPath !== projectPath) {
    return { success: true, output: result.stdout }
  }
  const activated = await setActiveProject(projectPath)
  return activated.success
    ? { success: true, layout: activated.layout, output: result.stdout }
    : { success: false, error: activated.error, output: result.stdout }
}
