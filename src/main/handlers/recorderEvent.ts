import { IpcMainEvent } from 'electron'
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

function recorderEvent(event: IpcMainEvent, data: any): void {
  console.log('[MainProcess] Received recorder event:', data)

  let commandString = ''
  switch (data.action) {
    case 'click':
      const escapedClickSelector = data.selector.replace(/"/g, '\\"')
      commandString = `@driver.find_element(:css, "${escapedClickSelector}").click # Clicked <${data.tagName.toLowerCase()}>`
      break

    case 'type':
      const escapedTypeSelector = data.selector.replace(/"/g, '\\"')
      const escapedValue = data.value.replace(/"/g, '\\"')
      commandString = `@driver.find_element(:css, "${escapedTypeSelector}").clear\n`
      commandString += `    @driver.find_element(:css, "${escapedTypeSelector}").send_keys("${escapedValue}")`
      break

    case 'sendKeys':
      const keySymbol = keyMap[data.value]
      if (keySymbol) {
        const escapedKeySelector = data.selector.replace(/"/g, '\\"')
        commandString = `@driver.find_element(:css, "${escapedKeySelector}").send_keys(${keySymbol}) # Pressed ${data.value} on <${data.tagName.toLowerCase()}>`
      }
      break
  }

  if (commandString) {
    appState.mainWindow?.webContents.send('new-recorded-command', commandString)
  }
}

export default recorderEvent
