import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** A usable ruby binary for `ruby -c` syntax checks, or undefined when none is installed. */
export function findRuby(): string | undefined {
  return ['ruby', join(homedir(), '.rubies/3.4.1/bin/ruby')].find((r) => {
    if (r.startsWith('/') && !existsSync(r)) return false
    return spawnSync(r, ['-e', '1']).status === 0
  })
}
