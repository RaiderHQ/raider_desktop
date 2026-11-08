import { create } from 'zustand'

/** What main's `is-ruby-installed` check answers */
export interface RubyCheckResult {
  success: boolean
  rubyVersion?: string
  rubyCommand?: string
  missingGems?: string[]
  versionWarning?: string
}

interface RubyStore {
  rubyCommand: string | null
  rubyVersion: string | null
  versionWarning: string | null
  /** The gems Raider needs that this Ruby lacks, from the last check */
  missingGems: string[]
  /** False until the first check has answered (or failed), so nothing reads "missing" early */
  checked: boolean
  setRubyCommand: (command: string | null) => void
  setRubyVersion: (version: string | null) => void
  setVersionWarning: (warning: string | null) => void
  /** Keeps a check's answer; null when the check itself failed */
  applyCheck: (result: RubyCheckResult | null) => void
}

const useRubyStore = create<RubyStore>(
  (set): RubyStore => ({
    rubyCommand: null,
    rubyVersion: null,
    versionWarning: null,
    missingGems: [],
    checked: false,
    setRubyCommand: (command: string | null): void => set({ rubyCommand: command }),
    setRubyVersion: (version: string | null): void => set({ rubyVersion: version }),
    setVersionWarning: (warning: string | null): void => set({ versionWarning: warning }),
    applyCheck: (result: RubyCheckResult | null): void =>
      set(
        result
          ? {
              rubyCommand: result.rubyCommand || null,
              rubyVersion: result.rubyVersion || null,
              versionWarning: result.versionWarning || null,
              missingGems: result.success ? [] : (result.missingGems ?? []),
              checked: true
            }
          : { checked: true }
      )
  })
)

export default useRubyStore
