import { create } from 'zustand'
import useVersionStore from '@foundation/Stores/versionStore'
import { installMissingGems } from '@foundation/installGems'

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
  /**
   * What goes before `gem install`: the check answers `<prefix> ruby` when Ruby is ready and
   * the bare prefix when gems are missing. Null when no Ruby was found.
   */
  gemPrefix: string | null
  /** False until the first check has answered (or failed), so nothing reads "missing" early */
  checked: boolean
  /** The last check threw: unknown, which is not the same as no Ruby */
  checkFailed: boolean
  /** A check or a gem install is under way */
  rechecking: boolean
  setRubyCommand: (command: string | null) => void
  setRubyVersion: (version: string | null) => void
  setVersionWarning: (warning: string | null) => void
  /** Keeps a check's answer; null when the check itself failed */
  applyCheck: (result: RubyCheckResult | null) => void
  /** Asks main again and reads the gem version again (after an install modal) */
  recheck: () => Promise<void>
  /** Installs gems with this Ruby, then checks again; busy throughout */
  installGems: (gems: string[]) => Promise<void>
}

const prefixFrom = (result: RubyCheckResult): string | null => {
  if (!result.rubyVersion && !result.rubyCommand) return null
  const command = result.rubyCommand ?? ''
  return result.success ? command.replace(/(^|\s+)ruby$/, '') : command
}

const useRubyStore = create<RubyStore>(
  (set, get): RubyStore => ({
    rubyCommand: null,
    rubyVersion: null,
    versionWarning: null,
    missingGems: [],
    gemPrefix: null,
    checked: false,
    checkFailed: false,
    rechecking: false,
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
              gemPrefix: prefixFrom(result),
              checked: true,
              checkFailed: false
            }
          : { checked: true, checkFailed: true }
      ),
    recheck: async (): Promise<void> => {
      set({ rechecking: true })
      try {
        get().applyCheck(await window.api.isRubyInstalled())
      } catch (error) {
        console.error('Ruby check failed:', error)
        get().applyCheck(null)
      }
      await useVersionStore.getState().loadVersion()
      set({ rechecking: false })
    },
    installGems: async (gems: string[]): Promise<void> => {
      set({ rechecking: true })
      await installMissingGems(get().gemPrefix ?? '', gems)
      await get().recheck()
    }
  })
)

export default useRubyStore
