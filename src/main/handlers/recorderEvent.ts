import { IpcMainEvent, BrowserWindow } from 'electron'

const keyMap: { [key: string]: string } = {
  Enter: ':enter',
  Tab: ':tab',
  ArrowUp: ':arrow_up',
  ArrowDown: ':arrow_down',
  ArrowLeft: ':arrow_left',
  ArrowRight: ':arrow_right',
  Escape: ':escape'
}

export default (mainWindow: BrowserWindow | null, event: IpcMainEvent, data: any) => {
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
    mainWindow?.webContents.send('new-recorded-command', commandString)
  }
}
