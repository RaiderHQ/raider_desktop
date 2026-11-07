import type { RunScope } from '@shared/types/runEvents'
import { isValidRubyCommand } from '../../utils/rubyCommand'
import { shellQuote } from '../../utils/shellCommand'

const TAG = /^[A-Za-z0-9_:-]+$/

/** Throws on any tag that could carry shell syntax. */
export function validateTags(tags: string[]): void {
  for (const tag of tags) {
    if (!TAG.test(tag)) throw new Error(`Invalid tag: ${tag}`)
  }
}

/** Tag selection flags, ORed: one --tag per tag. */
function tagOptions(tags: string[]): string {
  return tags.map((t) => `--tag ${t}`).join(' ')
}

/**
 * Builds the shell-safe run command (not yet wrapped by buildShellCommand) and the
 * effective worker count. `locations` always run serially; workers <= 1 is serial.
 */
export function buildRunCommand(opts: {
  scope: RunScope
  workers: number
  rubyCommand: string
}): { command: string; workers: number } {
  const { scope, rubyCommand } = opts
  if (!isValidRubyCommand(rubyCommand)) {
    throw new Error('The Ruby command is not valid, so the tests were not run.')
  }
  if (scope.kind === 'tags') validateTags(scope.tags)

  const workers = scope.kind === 'locations' || opts.workers <= 1 ? 1 : Math.floor(opts.workers)
  const bundle = `${rubyCommand} -S bundle exec`

  if (workers === 1) {
    let args = ''
    if (scope.kind === 'files') args = scope.files.map(shellQuote).join(' ')
    else if (scope.kind === 'locations') args = scope.locations.map(shellQuote).join(' ')
    else if (scope.kind === 'tags') args = tagOptions(scope.tags)
    return { command: `${bundle} rspec${args ? ` ${args}` : ''}`, workers }
  }

  let command = `${bundle} parallel_rspec -n ${workers} --prefix-output-with-test-env-number`
  if (scope.kind === 'tags') command += ` -o ${shellQuote(tagOptions(scope.tags))}`
  const paths = scope.kind === 'files' ? scope.files.map(shellQuote).join(' ') : 'spec'
  return { command: `${command} ${paths}`, workers }
}
