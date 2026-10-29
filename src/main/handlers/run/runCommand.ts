import type { RunScope } from '@shared/types/runEvents'
import { isValidRubyCommand } from '../../utils/rubyCommand'
import { shellQuote } from '../../utils/shellCommand'

export type Framework = 'rspec' | 'cucumber'

const TAG = /^[A-Za-z0-9_:-]+$/

/** Throws on any tag that could carry shell syntax. */
export function validateTags(tags: string[]): void {
  for (const tag of tags) {
    if (!TAG.test(tag)) throw new Error(`Invalid tag: ${tag}`)
  }
}

/** Tag selection flags, ORed: repeated --tag for rspec, one --tags expression for cucumber. */
function tagOptions(framework: Framework, tags: string[]): string {
  return framework === 'rspec'
    ? tags.map((t) => `--tag ${t}`).join(' ')
    : `--tags ${shellQuote(tags.map((t) => `@${t}`).join(' or '))}`
}

/**
 * Builds the shell-safe run command (not yet wrapped by buildShellCommand) and the
 * effective worker count. `locations` always run serially; workers <= 1 is serial.
 */
export function buildRunCommand(opts: {
  framework: Framework
  scope: RunScope
  workers: number
  rubyCommand: string
}): { command: string; workers: number } {
  const { framework, scope, rubyCommand } = opts
  if (!isValidRubyCommand(rubyCommand)) {
    throw new Error('The Ruby command is not valid, so the tests were not run.')
  }
  if (scope.kind === 'tags') validateTags(scope.tags)

  const workers = scope.kind === 'locations' || opts.workers <= 1 ? 1 : Math.floor(opts.workers)
  const bundle = `${rubyCommand} -S bundle exec`
  const root = framework === 'rspec' ? 'spec' : 'features'

  if (workers === 1) {
    let args = ''
    if (scope.kind === 'files') args = scope.files.map(shellQuote).join(' ')
    else if (scope.kind === 'locations') args = scope.locations.map(shellQuote).join(' ')
    else if (scope.kind === 'tags') args = tagOptions(framework, scope.tags)
    return { command: `${bundle} ${framework}${args ? ` ${args}` : ''}`, workers }
  }

  const tool = framework === 'rspec' ? 'parallel_rspec' : 'parallel_cucumber'
  let command = `${bundle} ${tool} -n ${workers} --prefix-output-with-test-env-number`
  if (scope.kind === 'tags') command += ` -o ${shellQuote(tagOptions(framework, scope.tags))}`
  const paths = scope.kind === 'files' ? scope.files.map(shellQuote).join(' ') : root
  return { command: `${command} ${paths}`, workers }
}
