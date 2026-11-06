import { describe, it, expect, vi } from 'vitest'
import { installRecordingState } from '../../src/main/handlers/recording/recordingState'

describe('installRecordingState', () => {
  const setup = (): { send: (v: unknown) => void; onChange: ReturnType<typeof vi.fn> } => {
    let handler: (e: unknown, v: unknown) => void = () => {}
    const ipc = {
      on: vi.fn((channel: string, h: typeof handler) => {
        if (channel === 'recording-state') handler = h
      })
    }
    const onChange = vi.fn()
    installRecordingState(ipc as never, onChange)
    return { send: (v) => handler({}, v), onChange }
  }

  it('reports true only for the boolean true', () => {
    const { send, onChange } = setup()
    send(true)
    expect(onChange).toHaveBeenLastCalledWith(true)
  })

  it.each([false, 'true', 1, null, undefined, {}])('reports false for %j', (value) => {
    const { send, onChange } = setup()
    send(value)
    expect(onChange).toHaveBeenLastCalledWith(false)
  })
})
