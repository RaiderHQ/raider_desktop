import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router'
import { useTranslation } from 'react-i18next'
import toast, { Toaster } from 'react-hot-toast'
import Logo from '@components/Logo'
import ConceptsModal from '@components/ConceptsModal'
import RubyInstallModal from '@components/RubyInstallModal'
import RubyGemsInstallModal from '@components/RubyGemsInstallModal'
import useVersionStore from '@foundation/Stores/versionStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { installMissingGems } from '@foundation/installGems'
import { subscribeRunEvents } from '@foundation/Stores/runStore'

const MainTemplate: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const raiderVersion = useVersionStore((state: { version: string }) => state.version)
  const { setRubyCommand, setRubyVersion, setVersionWarning } = useRubyStore()
  const [isRubyInstallModalOpen, setIsRubyInstallModalOpen] = useState(false)
  const [isGemsInstallModalOpen, setIsGemsInstallModalOpen] = useState(false)
  const [missingGems, setMissingGems] = useState<string[] | undefined>(undefined)
  const [isConceptsModalOpen, setIsConceptsModalOpen] = useState(false)

  // Run ruby check once at app startup
  useEffect(() => {
    const checkRuby = async (): Promise<void> => {
      try {
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
      } catch (error) {
        console.error('Ruby check failed:', error)
      }
    }
    checkRuby()
  }, [])

  useEffect(() => {
    const cleanup = window.electron.ipcRenderer.on(
      'suites-recovered',
      (_event, info?: { backupSaved?: boolean }) => {
        const key = info?.backupSaved === false ? 'backupFailed' : 'backupSaved'
        toast.error(t(`suites.recovered.${key}`), { duration: 10000 })
      }
    )
    return (): void => cleanup?.()
  }, [])

  useEffect(() => {
    const onMigrated = (_event: unknown, info: { migrated: number; postponed: boolean }): void => {
      if (info.postponed) {
        toast(t('suites.migrated.postponed'), { icon: '\u26A0\uFE0F', duration: 10000 })
      } else {
        toast.success(t('suites.migrated.done', { count: info.migrated }), { duration: 6000 })
      }
    }
    const onTooNew = (): void => {
      toast.error(t('suites.tooNew'), { duration: 10000 })
    }
    window.api.onTestsMigrated(onMigrated)
    window.api.onSuitesTooNew(onTooNew)
    return (): void => {
      window.api.removeTestsMigratedListener(onMigrated)
      window.api.removeSuitesTooNewListener(onTooNew)
    }
  }, [])

  // One subscription for the whole app; the run panel and indicators read the store
  useEffect(() => subscribeRunEvents(), [])

  const { rubyCommand } = useRubyStore()

  const handleInstallGems = async (): Promise<void> => {
    setIsGemsInstallModalOpen(false)
    await installMissingGems(rubyCommand!, missingGems!)
  }

  const projectPath = useProjectStore((state) => state.projectPath)

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center justify-between bg-white px-8 py-3 border-b border-neutral-bdr shadow-nav">
        <div className="flex items-center gap-3">
          {/* Logo: clickable, opens concepts modal */}
          <button
            onClick={() => setIsConceptsModalOpen(true)}
            aria-label="How Ruby Raider works"
            className="relative group focus:outline-none"
          >
            <Logo size={36} />
            {/* Hover ring */}
            <span className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 ring-2 ring-ruby/40 transition-opacity duration-200 pointer-events-none" />
            {/* Small "?" badge */}
            <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-ruby text-white text-[9px] font-bold flex items-center justify-center leading-none shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              ?
            </span>
          </button>
          {projectPath ? (
            <Link to="/overview" className="text-lg font-bold text-neutral-dark tracking-tight hover:text-ruby transition-colors">
              Ruby Raider
            </Link>
          ) : (
            <span className="text-lg font-bold text-neutral-dark tracking-tight">
              Ruby Raider
            </span>
          )}
        </div>

      </header>

      <main className="flex flex-col items-center justify-center flex-grow animate-page-enter pt-8 pb-8">
        <Outlet />
      </main>

      <footer className="flex justify-center py-3 bg-white border-t border-neutral-bdr">
        <p className="text-neutral-mid text-sm">{t('version', { version: raiderVersion })}</p>
      </footer>

      {isConceptsModalOpen && (
        <ConceptsModal onClose={() => setIsConceptsModalOpen(false)} />
      )}

      {isRubyInstallModalOpen && (
        <RubyInstallModal
          onClose={() => setIsRubyInstallModalOpen(false)}
          onCloseApp={() => window.api.closeApp()}
        />
      )}
      {isGemsInstallModalOpen && missingGems && (
        <RubyGemsInstallModal
          onInstall={handleInstallGems}
          onClose={() => setIsGemsInstallModalOpen(false)}
          missingGems={missingGems}
        />
      )}

      <Toaster />
    </div>
  )
}

export default MainTemplate
