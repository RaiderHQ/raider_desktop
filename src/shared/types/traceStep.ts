export interface TraceStep {
  id: string
  command: string
  timestamp: number
  url: string
  screenshotPath?: string
  elementInfo?: {
    tagName: string
    selector: string
    strategy: string
    innerText?: string
    boundingRect?: { x: number; y: number; width: number; height: number }
  }
}
