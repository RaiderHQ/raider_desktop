import { describe, it, expect } from 'vitest'
import { generateProjectSpecFile, generateRspecFile } from '../../../src/main/codegen/testFile'
import type { Step } from '../../../src/shared/types/step'

// The Ruby written for steps without a semantic locator, pinned so a change to the shape is deliberate
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
const settings = { browser: 'chrome', headless: false, explicitWait: 10 }
const opts = { fileRelPath: 'spec/checkout_spec.rb', helperPath: 'helpers' }

describe('codegen without locators', () => {
  it('project spec', () => {
    expect(generateProjectSpecFile(test, opts)).toMatchSnapshot()
  })
  it('standalone spec', () => {
    expect(generateRspecFile(test, settings)).toMatchSnapshot()
  })
})
