import { Menu } from 'electron'
import { randomUUID } from 'crypto'
import { appState } from '../appState'
import { toElementTarget } from './recorderEvent'
import type { AssertKind } from '@shared/types/step'
import type { AssertionMessage } from '@shared/types/pendingAssertion'

/** What the recorder page sends when the user right-clicks an element. */
export interface AssertionMenuRequest {
  selector: string
  strategy: string
  /** Semantic locator from the preload; kept only when it is well-formed */
  locator?: unknown
  ariaLabel?: string
  placeholder?: string
  elementText?: string
  elementValue?: string
  inputType?: string
  pageTitle?: string
  pageUrl?: string
}

/** Pops the assertion menu; each choice sends the main window a step or a pending assertion. */
export function showAssertionContextMenu(
  _event: unknown,
  {
    selector,
    strategy,
    locator,
    ariaLabel,
    placeholder,
    elementText,
    elementValue,
    inputType,
    pageTitle,
    pageUrl
  }: AssertionMenuRequest
): void {
  if (!appState.mainWindow) return

  const element =
    toElementTarget(strategy, selector, {
      innerText: elementText,
      ariaLabel,
      placeholder,
      locator
    }) ??
    undefined
  const post = (message: AssertionMessage): void => {
    appState.mainWindow!.webContents.send('add-assertion-step', message)
  }
  // Element waits and state checks are complete steps; the rest ask for expected text
  const wait = (until: 'visible' | 'hidden' | 'enabled'): void => {
    if (element) post({ id: randomUUID(), kind: 'wait', element, until })
  }
  const check = (kind: AssertKind): void => {
    if (element) post({ id: randomUUID(), kind: 'assert', check: kind, element })
  }
  const ask = (kind: AssertKind, text: string, needsElement = true): void => {
    if (needsElement && !element) return
    post({ pendingAssertion: kind, ...(needsElement ? { element } : {}), text })
  }

  const isCheckable = inputType === 'checkbox' || inputType === 'radio'

  const template: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [
    { label: 'Raider Assertions', enabled: false },
    { type: 'separator' },

    // --- Wait submenu ---
    {
      label: 'Wait for element',
      submenu: [
        { label: 'to appear', click: (): void => wait('visible') },
        { label: 'to disappear', click: (): void => wait('hidden') },
        { label: 'to be enabled', click: (): void => wait('enabled') }
      ]
    },
    { type: 'separator' },

    // --- Assert element state ---
    { label: 'Assert element is displayed', click: (): void => check('displayed') },
    { label: 'Assert element is NOT displayed', click: (): void => check('notDisplayed') },
    { label: 'Assert element is enabled', click: (): void => check('enabled') },
    ...(isCheckable
      ? [{ label: 'Assert element is checked', click: (): void => check('checked') }]
      : []),
    { type: 'separator' },

    // --- Assert content ---
    {
      label: 'Assert element text equals',
      click: (): void => ask('textEquals', (elementText || '').trim())
    },
    {
      label: 'Assert element text includes',
      click: (): void => ask('textIncludes', (elementText || '').trim())
    },
    {
      label: 'Assert element value',
      click: (): void => ask('valueEquals', (elementValue || '').trim())
    },
    { type: 'separator' },

    // --- Assert page ---
    {
      label: 'Assert page title',
      click: (): void => ask('titleEquals', pageTitle || '', false)
    },
    {
      label: 'Assert current URL contains',
      click: (): void => ask('urlIncludes', pageUrl || '', false)
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  if (appState.recorderWindow) {
    menu.popup({ window: appState.recorderWindow })
  } else if (appState.mainWindow) {
    menu.popup({ window: appState.mainWindow })
  }
}
