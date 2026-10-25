export interface TraceStep {
  id: string
  stepId?: string // the recorded Step this trace entry belongs to
  command: string // Ruby for the step, rendered for the project's automation
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
