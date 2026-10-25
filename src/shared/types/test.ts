import type { Step } from './step'
import type { TraceStep } from './traceStep'

export interface Test {
  id: string
  name: string
  url: string
  steps: Step[]
  trace?: TraceStep[]
  hasTrace?: boolean
}
