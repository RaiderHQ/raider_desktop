import { useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import toast, { Toaster } from 'react-hot-toast'
import Logo from '@components/Logo'
import Tooltip from '@components/Tooltip'
import RunIndicator from '@components/RunIndicator'
import ConceptsModal from '@components/ConceptsModal'
import RecordingGuide, { openRecordingGuide } from '@components/RecordingGuide'
import ShortcutsSheet from '@components/ShortcutsSheet'
import RubyInstallModal from '@components/RubyInstallModal'
import RubyGemsInstallModal from '@components/RubyGemsInstallModal'
import TraceViewerOverlay from '@components/TraceViewerOverlay'
import useVersionStore from '@foundation/Stores/versionStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { installMissingGems } from '@foundation/installGems'
import { subscribeRunEvents } from '@foundation/Stores/runStore'
import useTitleStore from '@foundation/Stores/titleStore'
import { windowTitle } from '@shared/windowTitle'
import { platformFrom } from '@shared/shortcuts'
import { dispatchMenuCommand, isMenuCommand } from '@foundation/menuCommands'
import { anyEditorDirty, pageEditorDirty, recorderBusy } from '@foundation/switchGuards'

const MainTemplate: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const raiderVersion = useVersionStore((state: { version: string }) => state.version)
  const { setRubyCommand, setRubyVersion, setVersionWarning } = useRubyStore()
  const [isRubyInstallModalOpen, setIsRubyInstallModalOpen] = useState(false)
  const [isGemsInstallModalOpen, setIsGemsInstallModalOpen] = useState(false)
  const [missingGems, setMissingGems] = useState<string[] | undefined>(undefined)
  const [isConceptsModalOpen, setIsConceptsModalOpen] = useState(false)
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false)
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false)
  // The sheet opened from the concepts modal: its footer button is gone, so focus goes to the logo
  const logoRef = useRef<HTMLButtonElement>(null)
  const sheetFromConcepts = useRef(false)
  useEffect(() => {
    if (isShortcutsOpen || !sheetFromConcepts.current) return
    sheetFromConcepts.current = false
    logoRef.current?.focus()
  }, [isShortcutsOpen])

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

  // Whoever reads the tests (the run panel, the dashboard) finds them current
  useEffect(() => {
    const reload = (): void => void useTestsListStore.getState().reload()
    return window.api.onTestsUpdated(reload)
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
    const offTooNew = window.api.onTestsTooNew(onTooNew)
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
  modalOpen.current =
    isRubyInstallModalOpen ||
    isGemsInstallModalOpen ||
    isConceptsModalOpen ||
    isShortcutsOpen ||
    isGuideModalOpen
  // The install modals gate the app; the help overlays swap with each other instead
  const installModalOpen = useRef(false)
  installModalOpen.current = isRubyInstallModalOpen || isGemsInstallModalOpen
  const pickingFolder = useRef(false)
  // The project stays loaded while the start screen shows, so the page matters as much as the store
  const location = useLocation()
  const onOverview = useRef(false)
  onOverview.current = location.pathname.startsWith('/overview')
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
    // Leaving a page with unsaved edits would drop them; the editor's own prompt is the way out,
    // so the menu commands stand down silently (the project menu on the Overview says why).
    // The Files tab's inline editor asks about New test itself, so only a project switch waits.
    const offMenu = window.api.onMenuCommand((command) => {
      if (!isMenuCommand(command)) return
      if (command === 'how-it-works' || command === 'shortcuts' || command === 'recording-guide') {
        if (installModalOpen.current) return
        // A swap from the menu is not the concepts modal's shortcuts button
        sheetFromConcepts.current = false
        setIsConceptsModalOpen(command === 'how-it-works')
        setIsShortcutsOpen(command === 'shortcuts')
        setIsGuideModalOpen(false)
        // Help › Recording guide: the card while recording, the modal otherwise
        if (command === 'recording-guide') openRecordingGuide(() => setIsGuideModalOpen(true))
        return
      }
      if (command === 'docs') {
        void window.api.openDocs('docs.home')
        return
      }
      if (modalOpen.current) return
      if (command === 'new-test') {
        // Only a project has a Tests tab; with none open nothing listens. The project stays
        // loaded while the start screen shows, so the page matters as much as the store
        if (!useProjectStore.getState().projectPath) return
        if (!onOverview.current) return
        if (pageEditorDirty()) return
        if (recorderBusy()) {
          toast.error(t('quickRecord.stopFirst'))
          return
        }
        navigate('/overview/tests/new')
        return
      }
      if (command === 'new-project' || command === 'open-project') {
        if (anyEditorDirty()) return
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
    // File › Open recent: a path main stored; the same guards as Open project, no folder dialog (U8)
    const offRecent = window.api.onOpenRecentProject((projectPath) => {
      if (typeof projectPath !== 'string' || !projectPath) return
      if (installModalOpen.current || modalOpen.current || pickingFolder.current) return
      if (anyEditorDirty()) return
      if (recorderBusy()) {
        toast.error(t('quickRecord.stopFirst'))
        return
      }
      setProjectPath(projectPath)
      navigate('/overview')
    })
    return (): void => {
      offMenu()
      offRecent()
    }
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
              ref={logoRef}
              onClick={() => setIsConceptsModalOpen(true)}
              aria-label={t('header.howItWorks')}
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

      {isConceptsModalOpen && (
        <ConceptsModal
          onClose={() => setIsConceptsModalOpen(false)}
          onOpenShortcuts={() => {
            sheetFromConcepts.current = true
            setIsConceptsModalOpen(false)
            setIsShortcutsOpen(true)
          }}
        />
      )}
      {isGuideModalOpen && (
        <RecordingGuide variant="modal" onClose={() => setIsGuideModalOpen(false)} />
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

      {isShortcutsOpen && <ShortcutsSheet onClose={() => setIsShortcutsOpen(false)} />}

      <TraceViewerOverlay />

      <Toaster />
    </div>
  )
}

export default MainTemplate
