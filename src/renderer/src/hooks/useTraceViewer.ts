import { useState } from 'react'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { TraceStep } from '@foundation/Types/traceStep'

export interface TraceViewerState {
  viewingTraceTestId: string | null
  traceSteps: TraceStep[]
  selectedTraceStepId: string | null
  testByName: Map<string, { id: string; hasTrace?: boolean }>
  handleViewTrace: (testName: string) => Promise<void>
  handleBackToResults: () => void
  setSelectedTraceStepId: (id: string | null) => void
}

/**
 * Shared hook for trace viewing functionality used by both
 * ProjectDashboard and RecordingDashboard.
 */
export function useTraceViewer(): TraceViewerState {
  const suites = useRecorderStore((s) => s.suites)

  const [viewingTraceTestId, setViewingTraceTestId] = useState<string | null>(null)
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([])
  const [selectedTraceStepId, setSelectedTraceStepId] = useState<string | null>(null)

  // Build a map from test name to test (for hasTrace lookup)
  const testByName = new Map<string, { id: string; hasTrace?: boolean }>()
  for (const suite of suites) {
    for (const test of suite.tests) {
      testByName.set(test.name, { id: test.id, hasTrace: test.hasTrace })
    }
  }

  const handleViewTrace = async (testName: string): Promise<void> => {
    const testInfo = testByName.get(testName)
    if (!testInfo) return

    const result = await window.api.loadTrace(testInfo.id)
    if (result.success && result.trace) {
      setTraceSteps(result.trace)
      setViewingTraceTestId(testInfo.id)
      setSelectedTraceStepId(null)
    }
  }

  const handleBackToResults = (): void => {
    setViewingTraceTestId(null)
    setTraceSteps([])
    setSelectedTraceStepId(null)
  }

  return {
    viewingTraceTestId,
    traceSteps,
    selectedTraceStepId,
    testByName,
    handleViewTrace,
    handleBackToResults,
    setSelectedTraceStepId
  }
}
