import * as monaco from 'monaco-editor'
import { registerRubyCompletions } from './rubyCompletions'
import { registerSeleniumCompletions } from './seleniumCompletions'
import { registerCapybaraCompletions } from './capybaraCompletions'
import { registerWatirCompletions } from './watirCompletions'
import {
  registerRspecCompletions,
  registerMinitestCompletions,
  registerCucumberCompletions
} from './testFrameworkCompletions'

let disposables: monaco.IDisposable[] = []

export function registerRubyProviders(
  monacoInstance: typeof monaco,
  automation: string | null,
  framework: string | null
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
  if (automationLower === 'capybara') {
    disposables.push(registerCapybaraCompletions(monacoInstance))
  }
  if (automationLower === 'watir') {
    disposables.push(registerWatirCompletions(monacoInstance))
  }

  // Register test framework-specific completions
  const frameworkLower = (framework || '').toLowerCase()
  if (frameworkLower === 'rspec' || frameworkLower === '') {
    disposables.push(registerRspecCompletions(monacoInstance))
  }
  if (frameworkLower === 'minitest') {
    disposables.push(registerMinitestCompletions(monacoInstance))
  }
  if (frameworkLower === 'cucumber') {
    disposables.push(registerCucumberCompletions(monacoInstance))
  }
}

export function disposeRubyProviders(): void {
  disposables.forEach((d) => d.dispose())
  disposables = []
}
