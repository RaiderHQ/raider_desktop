import type { TraceStep } from './traceStep'

export interface Test {
  id: string
  name: string
  url: string
  steps: string[]
  trace?: TraceStep[]
  hasTrace?: boolean
}
