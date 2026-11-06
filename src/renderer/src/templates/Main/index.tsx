import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import toast, { Toaster } from 'react-hot-toast'
import Logo from '@components/Logo'
import Tooltip from '@components/Tooltip'
import RunIndicator from '@components/RunIndicator'
import ConceptsModal from '@components/ConceptsModal'
import RubyInstallModal from '@components/RubyInstallModal'
import RubyGemsInstallModal from '@components/RubyGemsInstallModal'
import TraceViewerOverlay from '@components/TraceViewerOverlay'
import useVersionStore from '@foundation/Stores/versionStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { installMissingGems } from '@foundation/installGems'
import { subscribeRunEvents } from '@foundation/Stores/runStore'
import useTitleStore from '@foundation/Stores/titleStore'
import { windowTitle } from '@shared/windowTitle'
import { platformFrom } from '@shared/shortcuts'
import { dispatchMenuCommand, isMenuCommand } from '@foundation/menuCommands'

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
    const cleanup = window.api.onSuitesRecovered((info?: { backupSaved?: boolean }) => {
      const key = info?.backupSaved === false ? 'backupFailed' : 'backupSaved'
      toast.error(t(`suites.recovered.${key}`), { duration: 10000 })
    })
    return (): void => cleanup()
  }, [])

  useEffect(() => {
    const onMigrated = (info: { migrated: number; postponed: boolean }): void => {
      if (info.postponed) {
        toast(t('suites.migrated.postponed'), { icon: '\u26A0\uFE0F', duration: 10000 })
      } else {
        toast.success(t('suites.migrated.done', { count: info.migrated }), { duration: 6000 })
      }
    }
    const onTooNew = (): void => {
      toast.error(t('suites.tooNew'), { duration: 10000 })
    }
    const offMigrated = window.api.onTestsMigrated(onMigrated)
    const offTooNew = window.api.onSuitesTooNew(onTooNew)
    return (): void => {
      offMigrated()
      offTooNew()
    }
  }, [])

  // One subscription for the whole app; the run panel and indicators read the store
  useEffect(() => subscribeRunEvents(), [])

  const navigate = useNavigate()
  const setProjectPath = useProjectStore((state) => state.setProjectPath)

  // The menu bar's commands: the app-wide ones are handled here, the rest go to the open page.
  // Modal state is read through a ref so the one subscription sees the current values.
  const modalOpen = useRef(false)
  modalOpen.current = isRubyInstallModalOpen || isGemsInstallModalOpen || isConceptsModalOpen
  const pickingFolder = useRef(false)
  useEffect(() => {
    const openProject = async (): Promise<void> => {
      if (pickingFolder.current) return
      pickingFolder.current = true
      try {
        const folder = await window.api.selectFolder(t('landing.error.selectFolder'))
        if (!folder) return
        setProjectPath(folder)
        navigate('/overview')
      } catch (error) {
        console.error('Opening the project failed:', error)
        toast.error(t('landing.error.openProject'))
      } finally {
        pickingFolder.current = false
      }
    }
    // Switching projects mid-recording would save the recording into the wrong project
    const recorderBusy = (): boolean => {
      const { recordingTarget, isRecording, isReplayingToBreakpoint } = useRecorderStore.getState()
      return !!recordingTarget || isRecording || isReplayingToBreakpoint
    }
    return window.api.onMenuCommand((command) => {
      if (!isMenuCommand(command)) return
      if (command === 'how-it-works') {
        setIsConceptsModalOpen(true)
        return
      }
      if (modalOpen.current) return
      if (command === 'new-project' || command === 'open-project') {
        if (recorderBusy()) {
          toast.error(t('quickRecord.stopFirst'))
          return
        }
        if (command === 'new-project') navigate('/new')
        else void openProject()
        return
      }
      dispatchMenuCommand(command)
    })
  }, [])

  const { rubyCommand } = useRubyStore()

  const handleInstallGems = async (): Promise<void> => {
    setIsGemsInstallModalOpen(false)
    await installMissingGems(rubyCommand!, missingGems!)
  }

  const projectPath = useProjectStore((state) => state.projectPath)
  const titleDocument = useTitleStore((state) => state.document)

  // The window title and its edited dot follow the page's document
  useEffect(() => {
    const project = projectPath ? projectPath.split(/[\\/]/).filter(Boolean).pop() : null
    document.title = windowTitle({
      document: titleDocument,
      project,
      platform: platformFrom(navigator.platform)
    })
    window.api.setDocumentEdited(titleDocument?.edited === true, titleDocument?.name ?? '')
  }, [titleDocument, projectPath])

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="flex items-center justify-between bg-white px-8 py-3 border-b border-neutral-bdr shadow-nav">
        <div className="flex items-center gap-3">
          {/* Logo: clickable, opens concepts modal */}
          <Tooltip content={t('tooltips.header.logo')} position="bottom">
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
          </Tooltip>
          {projectPath ? (
            <Link
              to="/overview"
              className="text-lg font-bold text-neutral-dark tracking-tight hover:text-ruby transition-colors"
            >
              Ruby Raider
            </Link>
          ) : (
            <span className="text-lg font-bold text-neutral-dark tracking-tight">Ruby Raider</span>
          )}
        </div>
        <RunIndicator />
      </header>

      <main className="flex flex-col items-center justify-center flex-grow animate-page-enter pt-8 pb-8">
        <Outlet />
      </main>

      <footer className="flex justify-center py-3 bg-white border-t border-neutral-bdr">
        <p className="text-neutral-md text-sm">{t('version', { version: raiderVersion })}</p>
      </footer>

      {isConceptsModalOpen && <ConceptsModal onClose={() => setIsConceptsModalOpen(false)} />}

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

      <TraceViewerOverlay />

      <Toaster />
    </div>
  )
}

export default MainTemplate
