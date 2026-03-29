import { randomUUID } from 'crypto'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { webContents } from 'electron'
import { appState } from '../appState'
import { generateCommand } from '../frameworkTemplates'

export interface RecorderEventData {
  action: 'click' | 'type' | 'sendKeys'
  selector: string
  strategy: string
  tagName: string
  value?: string
  pageUrl?: string
  innerText?: string
  boundingRect?: { x: number; y: number; width: number; height: number }
}

function recorderEvent(data: RecorderEventData): void {
  // Ignore events triggered by the webview replay — only record real user actions
  if (appState.isReplayingInWebview) return

  const commandString = generateCommand(appState.projectAutomation, data)

  if (commandString) {
    appState.mainWindow?.webContents.send('new-recorded-command', commandString)

    // Capture trace step if trace dir is active
    if (appState.activeTraceDir && appState.recorderWebContentsId) {
      const stepId = randomUUID()
      const screenshotPath = join(appState.activeTraceDir, `${stepId}.jpg`)

      const wc = webContents.fromId(appState.recorderWebContentsId)
      if (wc) {
        wc.capturePage()
          .then((nativeImage) => {
            const jpeg = nativeImage.toJPEG(60)
            writeFileSync(screenshotPath, jpeg)

            const traceStep = {
              id: stepId,
              command: commandString,
              timestamp: Date.now(),
              url: data.pageUrl || '',
              screenshotPath,
              elementInfo: {
                tagName: data.tagName,
                selector: data.selector,
                strategy: data.strategy,
                innerText: data.innerText,
                boundingRect: data.boundingRect
              }
            }

            appState.mainWindow?.webContents.send('new-trace-step', traceStep)
          })
          .catch(() => {
            sendTraceWithoutScreenshot(stepId, commandString, data)
          })
      } else {
        sendTraceWithoutScreenshot(stepId, commandString, data)
      }
    }
  }
}

function sendTraceWithoutScreenshot(
  stepId: string,
  commandString: string,
  data: RecorderEventData
): void {
  const traceStep = {
    id: stepId,
    command: commandString,
    timestamp: Date.now(),
    url: data.pageUrl || '',
    elementInfo: {
      tagName: data.tagName,
      selector: data.selector,
      strategy: data.strategy,
      innerText: data.innerText,
      boundingRect: data.boundingRect
    }
  }

  appState.mainWindow?.webContents.send('new-trace-step', traceStep)
}

export default recorderEvent
