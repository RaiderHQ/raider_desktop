import { describe, it, expect } from 'vitest'
import { generateProjectSpecFile, generateRspecFile } from '../../../src/main/codegen/testFile'
import type { Step } from '../../../src/shared/types/step'

// Steps without a semantic locator must keep producing exactly the Ruby they always did
const css = { strategy: 'css' as const, value: '#a' }
const xp = { strategy: 'xpath' as const, value: "//a[text()='Go']", label: 'Go' }
const steps: Step[] = [
  { id: '1', kind: 'navigate', url: 'https://x.io' },
  { id: '2', kind: 'type', element: { strategy: 'id', value: 'email' }, text: "a'b" },
  { id: '3', kind: 'click', element: xp },
  { id: '4', kind: 'pressKey', element: css, key: 'Enter' },
  { id: '5', kind: 'wait', element: css, until: 'hidden' },
  { id: '6', kind: 'assert', check: 'textIncludes', element: css, expected: 'ok' },
  { id: '7', kind: 'assert', check: 'checked', element: css },
  { id: '8', kind: 'switchFrame', element: css }
]
const test = { name: 'Checkout', steps }
const settings = { browser: 'chrome', headless: false, implicitWait: 0, explicitWait: 10 }
const opts = { fileRelPath: 'spec/checkout_spec.rb', helperPath: 'helpers' }

describe('codegen without locators is unchanged', () => {
  for (const a of ['selenium', 'watir'] as const) {
    it(`${a} project spec`, () => {
      expect(generateProjectSpecFile(test, a, opts)).toMatchSnapshot()
    })
    it(`${a} standalone spec`, () => {
      expect(generateRspecFile(test, a, settings)).toMatchSnapshot()
    })
  }
})
