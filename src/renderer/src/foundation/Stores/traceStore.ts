import { create } from 'zustand'
import type { RaiderTraceIndex } from '@shared/types/raiderTrace'

// The one saved trace on screen. Main holds the zip until closeTrace, so every
// trace that leaves the screen is closed there too.
export interface TraceStore {
  current: { traceId: string; index: RaiderTraceIndex } | null
  opener: HTMLElement | null // gets focus back when the viewer closes
  show: (traceId: string, index: RaiderTraceIndex, opener?: HTMLElement | null) => void
  close: () => void
}

const release = (traceId: string): void => {
  window.api.closeTrace(traceId).catch(() => undefined)
}

export const useTraceStore = create<TraceStore>((set, get) => ({
  current: null,
  opener: null,
  show: (traceId, index, opener): void => {
    const { current } = get()
    if (current && current.traceId !== traceId) release(current.traceId)
    set({ current: { traceId, index }, opener: current ? get().opener : (opener ?? null) })
  },
  close: (): void => {
    const { current } = get()
    if (current) release(current.traceId)
    set({ current: null, opener: null })
  }
}))

export default useTraceStore
