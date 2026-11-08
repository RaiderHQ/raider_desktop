import * as monaco from 'monaco-editor'
import { registerRubyCompletions } from './rubyCompletions'
import { registerSeleniumCompletions } from './seleniumCompletions'
import { registerRspecCompletions } from './testFrameworkCompletions'

let disposables: monaco.IDisposable[] = []

export function registerRubyProviders(
  monacoInstance: typeof monaco,
  automation: string | null
): void {
  // Dispose previous registrations
  disposables.forEach((d) => d.dispose())
  disposables = []

  // Always register base Ruby completions
  disposables.push(registerRubyCompletions(monacoInstance))

  // Register automation-specific completions
  const automationLower = (automation || '').toLowerCase()
  if (automationLower === 'selenium' || automationLower === '') {
    disposables.push(registerSeleniumCompletions(monacoInstance))
  }

  disposables.push(registerRspecCompletions(monacoInstance))
}

export function disposeRubyProviders(): void {
  disposables.forEach((d) => d.dispose())
  disposables = []
}
