import { create } from 'zustand'

/** Where the Schedules panel remembers being open or collapsed, per project ('1' / '0') */
export const schedulesPanelOpenKey = (projectPath: string): string =>
  `schedulesPanelOpen:${projectPath}`

interface SchedulesFocusStore {
  /** Grows with each request; a mounted Overview and Schedules panel act on a change */
  request: number
  /**
   * A failed scheduled run's banner was clicked: remembers the project's panel as open (so a
   * panel mounted later opens too) and asks for the Tests tab with the panel open.
   */
  focus: (projectPath: string) => void
}

export const useSchedulesFocusStore = create<SchedulesFocusStore>((set, get) => ({
  request: 0,
  focus: (projectPath: string): void => {
    try {
      localStorage.setItem(schedulesPanelOpenKey(projectPath), '1')
    } catch {
      // Storage can be unavailable; the mounted panel still opens
    }
    set({ request: get().request + 1 })
  }
}))
