import useRecorderStore from '@foundation/Stores/recorderStore'

beforeEach(() => {
  useRecorderStore.setState({
    suites: [],
    activeSuiteId: null,
    activeTest: null,
    isRecording: false,
    isRunning: false,
    showCode: false,
    isOutputVisible: false
  })
})

describe('recorderStore', () => {
  it('has correct initial state', () => {
    const state = useRecorderStore.getState()
    expect(state.suites).toEqual([])
    expect(state.activeSuiteId).toBeNull()
    expect(state.activeTest).toBeNull()
    expect(state.isRecording).toBe(false)
    expect(state.isRunning).toBe(false)
    expect(state.showCode).toBe(false)
    expect(state.isOutputVisible).toBe(false)
  })

  it('setSuites updates suites', () => {
    const suites = [{ id: 's1', name: 'Suite 1', tests: [] }]
    useRecorderStore.getState().setSuites(suites)
    expect(useRecorderStore.getState().suites).toEqual(suites)
  })

  it('setActiveSuiteId updates the active suite', () => {
    useRecorderStore.getState().setActiveSuiteId('s1')
    expect(useRecorderStore.getState().activeSuiteId).toBe('s1')
  })

  it('setActiveSuiteId can be set to null', () => {
    useRecorderStore.getState().setActiveSuiteId('s1')
    useRecorderStore.getState().setActiveSuiteId(null)
    expect(useRecorderStore.getState().activeSuiteId).toBeNull()
  })

  it('setActiveTest sets the active test', () => {
    const test = { id: 't1', name: 'Test', url: '', steps: [] }
    useRecorderStore.getState().setActiveTest(test)
    expect(useRecorderStore.getState().activeTest).toEqual(test)
  })

  it('updateActiveTest applies the updater function', () => {
    const test = { id: 't1', name: 'Test', url: '', steps: ['step1'] }
    useRecorderStore.getState().setActiveTest(test)

    useRecorderStore.getState().updateActiveTest((prev) =>
      prev ? { ...prev, steps: [...prev.steps, 'step2'] } : null
    )

    expect(useRecorderStore.getState().activeTest?.steps).toEqual(['step1', 'step2'])
  })

  it('updateActiveTest returns null when prev is null', () => {
    useRecorderStore.getState().updateActiveTest((prev) =>
      prev ? { ...prev, name: 'updated' } : null
    )
    expect(useRecorderStore.getState().activeTest).toBeNull()
  })

  it('setIsRecording toggles recording state', () => {
    useRecorderStore.getState().setIsRecording(true)
    expect(useRecorderStore.getState().isRecording).toBe(true)

    useRecorderStore.getState().setIsRecording(false)
    expect(useRecorderStore.getState().isRecording).toBe(false)
  })

  it('setIsRunning toggles running state', () => {
    useRecorderStore.getState().setIsRunning(true)
    expect(useRecorderStore.getState().isRunning).toBe(true)
  })

  it('setShowCode toggles code view', () => {
    useRecorderStore.getState().setShowCode(true)
    expect(useRecorderStore.getState().showCode).toBe(true)
  })

  it('setIsOutputVisible toggles output visibility', () => {
    useRecorderStore.getState().setIsOutputVisible(true)
    expect(useRecorderStore.getState().isOutputVisible).toBe(true)
  })

  describe('activeSuite', () => {
    it('returns undefined when no suites', () => {
      expect(useRecorderStore.getState().activeSuite()).toBeUndefined()
    })

    it('returns undefined when activeSuiteId does not match', () => {
      useRecorderStore.setState({
        suites: [{ id: 's1', name: 'Suite', tests: [] }],
        activeSuiteId: 's2'
      })
      expect(useRecorderStore.getState().activeSuite()).toBeUndefined()
    })

    it('returns the matching suite', () => {
      const suite = { id: 's1', name: 'My Suite', tests: [] }
      useRecorderStore.setState({
        suites: [suite],
        activeSuiteId: 's1'
      })
      expect(useRecorderStore.getState().activeSuite()).toEqual(suite)
    })

    it('returns correct suite when multiple suites exist', () => {
      const suite1 = { id: 's1', name: 'Suite 1', tests: [] }
      const suite2 = { id: 's2', name: 'Suite 2', tests: [] }
      useRecorderStore.setState({
        suites: [suite1, suite2],
        activeSuiteId: 's2'
      })
      expect(useRecorderStore.getState().activeSuite()?.name).toBe('Suite 2')
    })
  })
})
