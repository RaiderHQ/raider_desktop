import { appState } from './appState'

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

export interface RecorderEventData {
  action: 'click' | 'type' | 'sendKeys'
  selector: string
  tagName: string
  value?: string
}

const formatLocator = (selector: string): { strategy: string; value: string } => {
  if (selector.startsWith('/') || selector.startsWith('(')) {
    return { strategy: 'xpath', value: selector }
  }
  if (selector.startsWith('#') && !/[\s>~+]/.test(selector)) {
    return { strategy: 'id', value: selector.substring(1) }
  }
  return { strategy: 'css', value: selector }
}

function recorderEvent(data: RecorderEventData): void {
  let commandString = ''
  const { strategy, value } = formatLocator(data.selector)
  const escapedValue = value.replace(/"/g, '\"')

  switch (data.action) {
    case 'click': {
      commandString = `@driver.find_element(:${strategy}, "${escapedValue}").click # Clicked <${data.tagName.toLowerCase()}>`
      break
    }

    case 'type': {
      const escapedDataValue = data.value!.replace(/"/g, '\"')
      commandString = `@driver.find_element(:${strategy}, "${escapedValue}").clear\n`
      commandString += `    @driver.find_element(:${strategy}, "${escapedValue}").send_keys("${escapedDataValue}")`
      break
    }

    case 'sendKeys': {
      const keySymbol = keyMap[data.value!]
      if (keySymbol) {
        commandString = `@driver.find_element(:${strategy}, "${escapedValue}").send_keys(${keySymbol}) # Pressed ${data.value} on <${data.tagName.toLowerCase()}>`
      }
      break
    }
  }

  if (commandString) {
    appState.mainWindow?.webContents.send('new-recorded-command', commandString)
  }
}

export default recorderEvent
