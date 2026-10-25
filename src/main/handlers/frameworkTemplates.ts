/**
 * Framework-aware code generation templates.
 *
 * Provides recorder command generation and export file settings.
 * Run/export test files come from codegen/testFile.ts.
 */

import xpathConverter from './xpathConverter'

// ---------------------------------------------------------------------------
// Recorder command generation — per automation framework
// ---------------------------------------------------------------------------

const keyMap: { [key: string]: string } = {
  Enter: ':enter',
  Tab: ':tab',
  Space: ':space',
  Backspace: ':backspace',
  Delete: ':delete',
  Escape: ':escape',
  ArrowUp: ':arrow_up',
  ArrowDown: ':arrow_down',
  ArrowLeft: ':arrow_left',
  ArrowRight: ':arrow_right',
  Home: ':home',
  End: ':end',
  PageUp: ':page_up',
  PageDown: ':page_down',
  F1: ':f1',
  F2: ':f2',
  F3: ':f3',
  F4: ':f4',
  F5: ':f5',
  F6: ':f6',
  F7: ':f7',
  F8: ':f8',
  F9: ':f9',
  F10: ':f10',
  F11: ':f11',
  F12: ':f12'
}

export interface RecorderAction {
  action: 'click' | 'type' | 'sendKeys'
  selector: string
  strategy: string
  tagName: string
  value?: string
}

function escapeSelector(strategy: string, selector: string): string {
  if (strategy === 'xpath') {
    return xpathConverter(selector)
  }
  return `"${selector.replace(/"/g, '"')}"`
}

export function generateSeleniumCommand(data: RecorderAction): string {
  const escapedValue = escapeSelector(data.strategy, data.selector)

  switch (data.action) {
    case 'click':
      return `@driver.find_element(:${data.strategy}, ${escapedValue}).click # Clicked <${data.tagName.toLowerCase()}>`

    case 'type': {
      const escapedDataValue = data.value!.replace(/"/g, '"')
      return (
        `@driver.find_element(:${data.strategy}, ${escapedValue}).clear\n` +
        `    @driver.find_element(:${data.strategy}, ${escapedValue}).send_keys("${escapedDataValue}")`
      )
    }

    case 'sendKeys': {
      const keySymbol = keyMap[data.value!]
      if (keySymbol) {
        return `@driver.find_element(:${data.strategy}, ${escapedValue}).send_keys(${keySymbol}) # Pressed ${data.value} on <${data.tagName.toLowerCase()}>`
      }
      return ''
    }

    default:
      return ''
  }
}

export function generateCapybaraCommand(data: RecorderAction): string {
  const { strategy, selector, tagName } = data
  const selectorArg =
    strategy === 'css' ? `"${selector}"` : strategy === 'xpath' ? `(:xpath, ${escapeSelector(strategy, selector)})` : `"#${selector}"`

  switch (data.action) {
    case 'click':
      return `find(${selectorArg}).click # Clicked <${tagName.toLowerCase()}>`

    case 'type': {
      const escapedDataValue = data.value!.replace(/"/g, '"')
      if (strategy === 'id') {
        return `fill_in "${selector}", with: "${escapedDataValue}"`
      }
      return (
        `find(${selectorArg}).set("")\n` +
        `    find(${selectorArg}).set("${escapedDataValue}")`
      )
    }

    case 'sendKeys': {
      const keyName = data.value!.toLowerCase().replace('arrow_', '')
      return `find(${selectorArg}).send_keys(:${keyName}) # Pressed ${data.value} on <${tagName.toLowerCase()}>`
    }

    default:
      return ''
  }
}

export function generateWatirCommand(data: RecorderAction): string {
  const { strategy, selector, tagName } = data

  let watirSelector: string
  if (strategy === 'id') {
    watirSelector = `id: "${selector}"`
  } else if (strategy === 'css') {
    watirSelector = `css: "${selector}"`
  } else {
    watirSelector = `xpath: ${escapeSelector(strategy, selector)}`
  }

  switch (data.action) {
    case 'click':
      return `browser.element(${watirSelector}).click # Clicked <${tagName.toLowerCase()}>`

    case 'type': {
      const escapedDataValue = data.value!.replace(/"/g, '"')
      return (
        `browser.element(${watirSelector}).clear\n` +
        `    browser.element(${watirSelector}).send_keys("${escapedDataValue}")`
      )
    }

    case 'sendKeys': {
      const keySymbol = keyMap[data.value!]
      if (keySymbol) {
        return `browser.element(${watirSelector}).send_keys(${keySymbol}) # Pressed ${data.value} on <${tagName.toLowerCase()}>`
      }
      return ''
    }

    default:
      return ''
  }
}

export function generateCommand(automation: string | null, data: RecorderAction): string {
  switch (automation) {
    case 'capybara':
      return generateCapybaraCommand(data)
    case 'watir':
      return generateWatirCommand(data)
    default:
      return generateSeleniumCommand(data)
  }
}

/**
 * Returns the file extension for export. Every framework exports an RSpec
 * `.rb` file until Cucumber feature generation lands.
 */
export function getExportExtension(_framework: string | null): string {
  return 'rb'
}

/**
 * Returns the file filter for save dialogs.
 */
export function getExportFilters(
  _framework: string | null
): { name: string; extensions: string[] }[] {
  return [
    { name: 'Ruby Scripts', extensions: ['rb'] },
    { name: 'All Files', extensions: ['*'] }
  ]
}
