import { vi, describe, it, expect, beforeEach } from 'vitest'
import useProjectStore from '@foundation/Stores/projectStore'
import useRecorderStore from '@foundation/Stores/recorderStore'

describe('recorder state on project switch', () => {
  beforeEach(() => {
    // @ts-expect-error - Mocking window.api
    window.api = {
      setActiveProject: vi.fn().mockResolvedValue({ success: true }),
      readDirectory: vi.fn().mockResolvedValue([])
    }
    useProjectStore.setState({ projectPath: '/a' })
  })

  it('clears the open test, suite, read-only view and breakpoints', () => {
    useRecorderStore.setState({
      activeSuiteId: 's1',
      activeTest: { id: 't', name: 'T_A', url: '', steps: [] },
      readOnlyView: { file: 'spec/x_spec.rb', examples: [] },
      readOnlyTitle: 'X',
      openTarget: { suiteId: 's1', testId: 't' },
      breakpointIndex: 2,
      failedStepId: 'x',
      suites: [{ id: 's1', name: 'S', tests: [] }]
    })
    useProjectStore.setState({ projectPath: '/b' })
    const s = useRecorderStore.getState()
    expect(s.activeTest).toBeNull()
    expect(s.activeSuiteId).toBeNull()
    expect(s.readOnlyView).toBeNull()
    expect(s.readOnlyTitle).toBeNull()
    expect(s.openTarget).toBeNull()
    expect(s.breakpointIndex).toBeNull()
    expect(s.failedStepId).toBeNull()
    expect(s.suites).toEqual([])
  })
})
