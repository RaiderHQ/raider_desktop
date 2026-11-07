export type IpcListeners = Map<string, (...args: unknown[]) => unknown>

const subscribe =
  (listeners: IpcListeners, channel: string) =>
  (callback: (...args: unknown[]) => unknown): (() => void) => {
    listeners.set(channel, callback)
    return (): void => {
      listeners.delete(channel)
    }
  }

/** The main-to-renderer `window.api.on*` subscriptions, backed by a channel map the test emits into */
export const ipcSubscriptions = (listeners: IpcListeners): Record<string, unknown> => ({
  onSuiteUpdated: subscribe(listeners, 'suite-updated'),
  onSuitesRecovered: subscribe(listeners, 'suites-recovered'),
  onRecordingStarted: subscribe(listeners, 'recording-started'),
  onRecordingStopped: subscribe(listeners, 'recording-stopped'),
  onNewRecordedStep: subscribe(listeners, 'new-recorded-step'),
  onAddAssertionStep: subscribe(listeners, 'add-assertion-step'),
  onNewTraceStep: subscribe(listeners, 'new-trace-step'),
  onReplayFailed: subscribe(listeners, 'replay-failed'),
  onRecorderPicked: subscribe(listeners, 'recorder-picked')
})
