import useRecorderStore from '@foundation/Stores/recorderStore'

beforeEach(() => {
  useRecorderStore.setState({
    activeTest: null,
    activeTestSaved: false,
    isRecording: false,
    isRunning: false,
    showCode: false,
    isOutputVisible: false
  })
})

describe('recorderStore', () => {
  it('has correct initial state', () => {
    const state = useRecorderStore.getState()
    expect(state.activeTestSaved).toBe(false)
    expect(state.activeTest).toBeNull()
    expect(state.isRecording).toBe(false)
    expect(state.isRunning).toBe(false)
    expect(state.showCode).toBe(false)
    expect(state.isOutputVisible).toBe(false)
  })

  it('setActiveTestSaved says whether the open test is a saved one', () => {
    useRecorderStore.getState().setActiveTestSaved(true)
    expect(useRecorderStore.getState().activeTestSaved).toBe(true)
    useRecorderStore.getState().setActiveTestSaved(false)
    expect(useRecorderStore.getState().activeTestSaved).toBe(false)
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

  describe('resetForProject', () => {
    it('stops showing a recording or run from the project that was open', () => {
      useRecorderStore.setState({ isRecording: true, isRunning: true })
      useRecorderStore.getState().resetForProject()
      expect(useRecorderStore.getState().isRecording).toBe(false)
      expect(useRecorderStore.getState().isRunning).toBe(false)
    })
  })
})
