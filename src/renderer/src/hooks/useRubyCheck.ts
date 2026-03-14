import { useEffect } from 'react'
import toast from 'react-hot-toast'
import useRubyStore from '@foundation/Stores/rubyStore'

interface RubyCheckResult {
  setIsRubyInstallModalOpen: (v: boolean) => void
  setIsGemsInstallModalOpen: (v: boolean) => void
  setMissingGems: (gems: string[] | undefined) => void
}

export function useRubyCheck({
  setIsRubyInstallModalOpen,
  setIsGemsInstallModalOpen,
  setMissingGems
}: RubyCheckResult): void {
  const { setRubyCommand, setRubyVersion, setVersionWarning } = useRubyStore()

  useEffect(() => {
    const checkRuby = async (): Promise<void> => {
      const result = await window.api.isRubyInstalled()
      setRubyCommand(result.rubyCommand || null)
      setRubyVersion(result.rubyVersion || null)
      setVersionWarning(result.versionWarning || null)

      if (result.versionWarning) {
        toast(result.versionWarning, { icon: '\u26A0\uFE0F', duration: 8000 })
      }

      if (!result.success) {
        setMissingGems(result.missingGems)
        if (result.rubyCommand) {
          setIsGemsInstallModalOpen(true)
        } else {
          setIsRubyInstallModalOpen(true)
        }
      }
    }
    checkRuby()
  }, [])
}
