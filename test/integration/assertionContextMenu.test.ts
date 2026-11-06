import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'

const mockSend = vi.fn()
let template: MenuItemConstructorOptions[] = []

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: (items: MenuItemConstructorOptions[]) => {
      template = items
      return { popup: vi.fn() }
    }
  }
}))

vi.mock('../../src/main/handlers/appState', () => ({
  appState: {
    mainWindow: { webContents: { send: (...args: unknown[]) => mockSend(...args) } }
  }
}))

import { englishText } from '../../src/shared/describeStepEnglish'
import { showAssertionContextMenu } from '../../src/main/handlers/recording/assertionContextMenu'

const t = (key: string): string => englishText(`assertions.menu.${key}`)

const ROLE_LOCATOR = {
  by: 'role',
  role: 'button',
  name: 'Save',
  nameFrom: 'content',
  tag: 'button'
}

/** Right-clicks an element with `locator`, then picks the menu item called `label`. */
function choose(label: string, locator: unknown): unknown {
  showAssertionContextMenu(null, {
    selector: '//button[normalize-space()="Save"]',
    strategy: 'xpath',
    locator,
    elementText: 'Save'
  })
  const item = template.find((i) => i.label === label)!
  item.click!({} as never, undefined, {} as never)
  const sent = mockSend.mock.calls.filter((c) => c[0] === 'add-assertion-step')
  return sent[sent.length - 1][1]
}

describe('showAssertionContextMenu', () => {
  beforeEach(() => {
    mockSend.mockClear()
    template = []
  })

  it("keeps a well-formed locator on the assertion step's element", () => {
    expect(choose(t('visible'), ROLE_LOCATOR)).toMatchObject({
      kind: 'assert',
      check: 'displayed',
      element: {
        strategy: 'xpath',
        value: '//button[normalize-space()="Save"]',
        locator: ROLE_LOCATOR
      }
    })
  })

  it('an exact-text check is pre-filled with all 300 characters of the text', () => {
    const long = 'z'.repeat(300)
    showAssertionContextMenu(null, { selector: '#a', strategy: 'css', elementText: long })
    template.find((i) => i.label === t('textIs'))!.click!({} as never, undefined, {} as never)
    const sent = mockSend.mock.calls.filter((c) => c[0] === 'add-assertion-step').at(-1)![1]
    expect(sent).toMatchObject({ pendingAssertion: 'textEquals', text: long })
  })

  it('keeps the locator on an assertion that asks for the expected text', () => {
    expect(choose(t('textIs'), ROLE_LOCATOR)).toMatchObject({
      pendingAssertion: 'textEquals',
      element: { locator: ROLE_LOCATOR },
      text: 'Save'
    })
  })

  it.each([
    ['an unknown kind', { by: 'magic', value: 'x' }],
    ['a missing name', { by: 'role', role: 'button' }],
    ['a non-object', 'role=button']
  ])('drops a locator with %s but keeps the element', (_label, locator) => {
    const step = choose(t('visible'), locator) as { element: object }
    expect(step.element).toEqual({
      strategy: 'xpath',
      value: '//button[normalize-space()="Save"]',
      label: 'Save'
    })
  })

  it('menu labels are the plain-words set, in the same order', () => {
    showAssertionContextMenu(null, {
      selector: '#c',
      strategy: 'css',
      inputType: 'checkbox'
    })
    const labels = (items: MenuItemConstructorOptions[]): unknown[] =>
      items.filter((i) => i.type !== 'separator').map((i) => i.label)
    const wait = template.find((i) => i.submenu)!
    expect(labels(template)).toEqual(
      [
        'header',
        'wait',
        'visible',
        'hidden',
        'enabled',
        'checked',
        'textIs',
        'textContains',
        'valueIs',
        'titleIs',
        'urlContains'
      ].map(t)
    )
    expect(labels(wait.submenu as MenuItemConstructorOptions[])).toEqual(
      ['waitAppears', 'waitDisappears', 'waitEnabled'].map(t)
    )
    expect(t('header')).toBe('Add a check')
    expect(t('textIs')).toBe('Check its text is exactly…')
  })
})
