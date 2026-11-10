import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useMatch, useNavigate, useParams } from 'react-router'
import toast from 'react-hot-toast'
import { sample } from 'lodash'
import { FaChevronDown, FaChevronRight, FaTerminal } from 'react-icons/fa'
import Folder from '@components/Library/Folder'
import RecordingSettingsPanel from '@components/RecordingSettingsPanel'
import ContextMenu from '@components/ContextMenu'
import FileNameDialog from '@components/FileNameDialog'
import useFileClipboardStore, { copiedIn } from '@foundation/Stores/fileClipboardStore'
import {
  isUnder,
  namesAt,
  parentRel,
  toProjectAbs,
  toProjectRel
} from '@foundation/projectFilePaths'
import { successWithUndo } from '@foundation/undoToast'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import ToggleSwitch from '@components/ToggleSwitch'
import TagInput from '@components/TagInput'
import ProjectDashboard from '@components/ProjectDashboard'
import Editor from '@components/Editor'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import { onMenuCommand } from '@foundation/menuCommands'
import useEditorStore from '@foundation/Stores/editorStore'
import EditorSaveBar from '@components/EditorSaveBar'
import UnsavedChangesModal from '@components/UnsavedChangesModal'
import Terminal from '@components/Terminal'
import Tooltip from '@components/Tooltip'
import TestsWorkspace from '@components/TestsWorkspace'
import FlowsPane from '@components/Flows/FlowsPane'
import InfoButton from '@components/InfoButton'
import ProjectMenu from '@components/ProjectMenu'
import DocsLink from '@components/DocsLink'
import type { DocsLinkId } from '@shared/docsLinkIds'
import RunPanel from '@components/RunPanel'
import MobileProjectUnsupported from '@components/MobileProjectUnsupported'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import {
  FOLDER_SCAFFOLD_TYPES,
  isScaffoldName,
  scaffoldFileName,
  type FolderScaffoldType
} from '@shared/scaffoldName'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { isEmptyRecording } from '../../hooks/useTestRecording'
import { useRecorderSettings } from '../../hooks/useRecorderSettings'
import { useRunStore } from '@foundation/Stores/runStore'
import { loadRunSettings, saveRunSettings, type RunSettings } from '@foundation/run/runSettings'
import { failedLocations } from '@foundation/run/rerunLocations'
import { loadRaiderResults } from '@foundation/raiderResults'
import { FileNode } from '@foundation/Types/fileNode'
import type { TestResult } from '@foundation/Types/testResult'
import { getFileLanguage } from '@foundation/helpers'
import { loadSettingsCollapsed, saveSettingsCollapsed } from '@foundation/filesSettingsCollapsed'
import { TAG_RE } from '@shared/tags'
import type { RunDefaults, RunScope } from '@shared/types/runEvents'

type OverviewTab = 'tests' | 'flows' | 'files' | 'dashboard'

const OVERVIEW_DOCS: Record<
  OverviewTab,
  (t: (key: string) => string) => { id: DocsLinkId; topic: string }
> = {
  tests: (t) => ({ id: 'docs.recorder', topic: t('docs.topics.recording') }),
  flows: (t) => ({ id: 'docs.flows', topic: t('docs.topics.flows') }),
  files: (t) => ({ id: 'docs.testScreen', topic: t('docs.topics.files') }),
  dashboard: (t) => ({ id: 'docs.dashboard', topic: t('docs.topics.dashboard') })
}

/** A base URL the browser can open: a full http or https address. */
const isWebAddress = (value: string): boolean => {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}


// The Files menu's items for generated files, in menu order
const SCAFFOLD_MENU_LABEL: Record<FolderScaffoldType, string> = {
  page: 'files.menu.newPage',
  spec: 'files.menu.newSpec',
  component: 'files.menu.newComponent',
  helper: 'files.menu.newHelper'
}

const Overview: React.FC = () => {
  const { t } = useTranslation()
  const projectPath: string | null = useProjectStore((state) => state.projectPath)
  const files: FileNode[] = useProjectStore((state) => state.files)
  const layout = useProjectStore((state) => state.layout)
  // Mobile (Appium) projects are not supported: the whole view is replaced by one message
  const mobileProject = layout?.unsupportedReason === 'mobile'
  // Until the layout is known the browser settings don't show, so defaults can't be saved
  const showWebSettings = layout !== null
  const navigate = useNavigate()
  const { testKey } = useParams()
  const isNewTestRoute = useMatch('/overview/tests/new') !== null
  // Each navigation has its own key, so New test again at the same URL still lands here
  const location = useLocation()
  const locationKey = location.key
  // A failed scheduled run's notification asks for the Flows tab (navigated with this state)
  const flowsRequested = (location.state as { tab?: unknown } | null)?.tab === 'flows'
  const { implicitWait, setImplicitWait, explicitWait, setExplicitWait, loaded } =
    useRecorderSettings()
  const [activeTab, setActiveTab] = useState<OverviewTab>('tests')

  // Until the project's settings load, the fields hold defaults that must not overwrite the config
  const saveWait = async (
    patch: { implicitWait: number } | { explicitWait: number }
  ): Promise<void> => {
    if (!loaded) return
    try {
      const result = await window.api.updateRecordingSettings(patch)
      if (!result.success) {
        toast.error(`${t('settings.recording.error.unexpected')} : ${result.error}`)
      }
    } catch (error) {
      toast.error(`${t('settings.recording.error.unexpected')} : ${error}`)
    }
  }

  // A test route always shows the Tests tab, also when the same test is opened again (Flows › Edit)
  useEffect(() => {
    if (testKey) setActiveTab('tests')
  }, [testKey, locationKey])

  const [runMode, setRunMode] = useState<'all' | 'smoke' | 'regression' | 'custom'>('all')
  const [customTag, setCustomTag] = useState('')
  const tagInputRef = useRef<HTMLInputElement | null>(null)

  // Live run state
  const run = useRunStore((state) => state.run)
  const runActive = useRunStore((state) => state.isActive)
  const freshLoginNext = useRunStore((state) => state.freshLoginNext)
  const setFreshLoginNext = useRunStore((state) => state.setFreshLoginNext)
  const recorderRunning = useRecorderStore((s) => s.isRunning)
  const runBusy = runActive || recorderRunning
  const [runSettings, setRunSettings] = useState<RunSettings>(() =>
    loadRunSettings(projectPath ?? '')
  )
  const [runDefaults, setRunDefaults] = useState<RunDefaults | null>(null)
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  // The Files tab's settings fold to their header so the files get the room (kept per user)
  const [settingsCollapsed, setSettingsCollapsed] = useState(loadSettingsCollapsed)
  const toggleSettings = (): void => {
    setSettingsCollapsed((collapsed) => {
      saveSettingsCollapsed(!collapsed)
      return !collapsed
    })
  }
  const [lastResults, setLastResults] = useState<TestResult[] | null>(null)
  // A run of another project says nothing about this one's failures
  const projectRun = run && run.projectPath === projectPath ? run : null
  const projectRunFinishedAt = projectRun?.finished?.finishedAt ?? null
  const canRerunFailed = failedLocations(projectRun, lastResults).length > 0

  // Test settings state
  const [browserUrl, setBrowserUrl] = useState('')
  // Why the typed base URL can't be saved, shown under the field
  const [urlError, setUrlError] = useState<string | null>(null)
  // The address as last loaded or written: a blur that changes nothing writes nothing
  const savedUrl = useRef('')
  const loadBrowserUrl = (value: string): void => {
    setBrowserUrl(value)
    savedUrl.current = value.trim()
    setUrlError(null)
  }
  // A quiet "Saved" next to the settings after a successful write, instead of a toast
  const [settingsSaved, setSettingsSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showSaved = (): void => {
    setSettingsSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSettingsSaved(false), 2500)
  }
  useEffect(() => (): void => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])
  const [selectedBrowser, setSelectedBrowser] = useState('chrome')
  const [headless, setHeadless] = useState(false)

  // Project settings state (migrated from the old settings page)
  const [timeout, setTimeout_] = useState(30)

  const [browserOptions, setBrowserOptions] = useState<string[]>([])
  const [configLoaded, setConfigLoaded] = useState(false)
  // Latest-request-wins token for config loads (project load and browser-change re-fetch)
  const configRequestRef = useRef(0)

  // File context menu state: a file or folder row, or the root (its row and empty tree space)
  const [fileContextMenu, setFileContextMenu] = useState<{
    x: number
    y: number
    filePath: string
    fileName: string
    kind: 'file' | 'folder' | 'root'
  } | null>(null)
  // The name dialog of New file, New folder, Rename and New page object… (and the other
  // generated files); paths are project-relative
  const [nameDialog, setNameDialog] = useState<
    | { mode: 'file' | 'folder'; folderRel: string }
    | { mode: 'rename'; folderRel: string; rel: string; name: string; isFolder: boolean }
    | { mode: 'scaffold'; folderRel: string; type: FolderScaffoldType }
    | null
  >(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ filePath: string; fileName: string } | null>(
    null
  )
  // The entry last created or pasted: the tree opens the folders holding it
  const [revealPath, setRevealPath] = useState<string | undefined>(undefined)
  // Used once: the tree opens its folders when it sees it (children's effects run first)
  useEffect(() => {
    if (revealPath) setRevealPath(undefined)
  }, [revealPath])

  // Terminal state
  const [terminalOpen, setTerminalOpen] = useState(false)

  // Inline editor state
  // `openId` names one opening of a file: the editor keeps its state when the file is renamed
  const [editingFile, setEditingFile] = useState<{
    path: string
    name: string
    openId?: number
  } | null>(null)
  const openCount = useRef(0)
  const [fileContent, setFileContent] = useState('')
  // What is on disk, as far as this page knows; the file is dirty when the editor differs
  const [savedContent, setSavedContent] = useState('')
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [isSavingFile, setIsSavingFile] = useState(false)
  // Each discard remounts the editor so Monaco shows the saved text again
  const [editorRevision, setEditorRevision] = useState(0)
  // What the user was about to do when asked about unsaved changes
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null)
  const fileDirty = !!editingFile && fileContent !== savedContent
  // One dirty value, two stores: editorStore drives the menu guards (New test, New project,
  // Open project stand down); titleStore drives the window title and the close guard.
  // A later cleanup may fold them into one.
  // Only the Files tab shows the open file, so only it names the window
  useDocumentTitle(activeTab === 'files' ? (editingFile?.name ?? null) : null, fileDirty)
  useEffect(() => {
    useEditorStore.getState().setInlineDirty(fileDirty)
  }, [fileDirty])
  useEffect(() => (): void => useEditorStore.getState().setInlineDirty(false), [])

  useEffect(() => {
    if (!projectPath) {
      navigate('/start-project')
    }
  }, [projectPath, navigate])

  // Load test settings from config files, falling back to localStorage. Not for a mobile project.
  useEffect(() => {
    if (!projectPath) return
    if (mobileProject) {
      // Discards a load that started before the layout said mobile
      ++configRequestRef.current
      return
    }
    setConfigLoaded(false)
    const token = ++configRequestRef.current
    const isCurrent = (): boolean => token === configRequestRef.current
    const loadSettings = async (): Promise<void> => {
      try {
        const result = await window.api.getProjectConfig(projectPath)
        if (!isCurrent()) return
        if (!result.success || !result.config) {
          setTimeout_(30)
          setBrowserOptions([])
        }
        if (result.success && result.config) {
          const {
            baseUrl,
            browser,
            headless: headlessVal,
            timeout: timeoutVal,
            browserArguments
          } = result.config
          if (baseUrl) {
            loadBrowserUrl(baseUrl)
            localStorage.setItem('browserUrl', baseUrl)
          } else {
            const storedUrl = localStorage.getItem('browserUrl')
            if (storedUrl) loadBrowserUrl(storedUrl)
          }
          if (browser) {
            setSelectedBrowser(browser)
            localStorage.setItem('selectedBrowser', browser)
          } else {
            const storedBrowser = localStorage.getItem('selectedBrowser')
            if (storedBrowser) setSelectedBrowser(storedBrowser)
          }
          setTimeout_(typeof timeoutVal === 'number' ? timeoutVal : 30)
          setBrowserOptions(browserArguments ?? [])
          if (typeof headlessVal === 'boolean') {
            setHeadless(headlessVal)
            localStorage.setItem('headless', String(headlessVal))
          } else {
            const storedHeadless = localStorage.getItem('headless')
            if (storedHeadless !== null) setHeadless(storedHeadless === 'true')
          }
        } else {
          // Fallback to localStorage if config files aren't available
          const storedUrl = localStorage.getItem('browserUrl')
          const storedBrowser = localStorage.getItem('selectedBrowser')
          const storedHeadless = localStorage.getItem('headless')
          if (storedUrl) loadBrowserUrl(storedUrl)
          if (storedBrowser) setSelectedBrowser(storedBrowser)
          if (storedHeadless !== null) setHeadless(storedHeadless === 'true')
        }
      } catch {
        if (!isCurrent()) return
        setTimeout_(30)
        setBrowserOptions([])
        // Fallback to localStorage on error
        const storedUrl = localStorage.getItem('browserUrl')
        const storedBrowser = localStorage.getItem('selectedBrowser')
        const storedHeadless = localStorage.getItem('headless')
        if (storedUrl) loadBrowserUrl(storedUrl)
        if (storedBrowser) setSelectedBrowser(storedBrowser)
        if (storedHeadless !== null) setHeadless(storedHeadless === 'true')
      }
    }
    void loadSettings().finally(() => {
      if (isCurrent()) setConfigLoaded(true)
    })
  }, [projectPath, mobileProject])

  // A quick-record project lives in Raider's own folder until the user saves it somewhere
  const [isQuick, setIsQuick] = useState(false)
  useEffect(() => {
    setIsQuick(false)
    if (!projectPath) return
    let current = true
    Promise.resolve(window.api.isQuickProject(projectPath))
      .then((quick) => {
        if (current) setIsQuick(quick)
      })
      .catch(() => {})
    return (): void => {
      current = false
    }
  }, [projectPath])

  const [saving, setSaving] = useState(false)
  // Moving the project resets the recorder, so it waits until nothing recorded is at stake
  const recorderBusy = useRecorderStore(
    (r) =>
      r.isRecording ||
      r.isReplayingToBreakpoint ||
      r.recordingTarget != null ||
      // An empty draft is never saved, so there is nothing to lose
      (r.draftTest != null &&
        !isEmptyRecording(r.activeTest?.id === r.draftTest.id ? r.activeTest : r.draftTest)) ||
      r.unsavedExample != null
  )

  const handleSaveProjectTo = async (): Promise<void> => {
    if (!projectPath || saving || recorderBusy) return
    setSaving(true)
    try {
      const folder = await window.api.selectFolder(t('quickRecord.saveToTitle'))
      if (!folder) return
      const result = await window.api.saveQuickProjectTo(projectPath, folder)
      if (!result.success) {
        toast.error(t('quickRecord.saveFailed', { error: result.error }))
        return
      }
      useProjectStore.getState().setProjectPath(result.projectPath)
      toast.success(t('quickRecord.saved', { path: result.projectPath }))
    } catch (error) {
      toast.error(t('quickRecord.saveFailed', { error: String(error) }))
    } finally {
      setSaving(false)
    }
  }

  const handleUrlSave = async (): Promise<void> => {
    if (!projectPath) {
      toast.error(t('settings.noProject.description'))
      return
    }
    const url = browserUrl.trim()
    if (!url || url === savedUrl.current) return
    if (!isWebAddress(url)) {
      setUrlError(t('overview.settings.urlInvalid'))
      return
    }
    setUrlError(null)
    try {
      const response = await window.api.updateBrowserUrl(projectPath, url)
      if (!response.success) {
        toast.error(response.error || t('overview.settings.urlUpdateFailed'))
        return
      }
      localStorage.setItem('browserUrl', url)
      savedUrl.current = url
      showSaved()
    } catch (error) {
      toast.error(`${t('overview.settings.urlUpdateFailed')}: ${(error as Error).message}`)
    }
  }

  const handleBrowserChange = async (
    event: React.ChangeEvent<HTMLSelectElement>
  ): Promise<void> => {
    const browser = event.target.value
    setSelectedBrowser(browser)
    if (!projectPath) {
      toast.error(t('settings.noProject.description'))
      return
    }
    const token = ++configRequestRef.current
    const isCurrent = (): boolean => token === configRequestRef.current
    setConfigLoaded(false)
    try {
      const response = await window.api.updateBrowserType(projectPath, browser)
      if (!response.success) {
        toast.error(response.error || t('overview.settings.browserUpdateFailed'))
        if (isCurrent()) setConfigLoaded(true)
        return
      }
      localStorage.setItem('selectedBrowser', browser)
      showSaved()
    } catch (error) {
      toast.error(`${t('overview.settings.browserUpdateFailed')}: ${(error as Error).message}`)
      if (isCurrent()) setConfigLoaded(true)
      return
    }
    // browser_arguments are kept per browser, so show the new browser's list
    let args: string[] = []
    try {
      const config = await window.api.getProjectConfig(projectPath)
      if (config.success) args = config.config?.browserArguments ?? []
    } catch {
      // re-fetch failed: clear rather than show the previous browser's args
    }
    if (!isCurrent()) return
    setBrowserOptions(args)
    setConfigLoaded(true)
  }

  const handleHeadlessToggle = async (enabled: boolean): Promise<void> => {
    setHeadless(enabled)
    if (!projectPath) {
      toast.error(t('settings.noProject.description'))
      setHeadless(!enabled)
      return
    }
    try {
      const response = await window.api.updateHeadlessMode(projectPath, enabled)
      if (!response.success) {
        setHeadless(!enabled)
        let errorMsg = response.error || t('overview.settings.headlessUpdateFailed')
        if (errorMsg.includes('is not installed') || errorMsg.includes('rbenv')) {
          errorMsg = 'Ruby version not found. Please set a valid Ruby version with rbenv (e.g. rbenv local 3.4.1) in your project directory.'
        }
        toast.error(errorMsg)
        return
      }
      localStorage.setItem('headless', String(enabled))
      showSaved()
    } catch (error) {
      setHeadless(!enabled)
      toast.error(`${t('overview.settings.headlessUpdateFailed')}: ${(error as Error).message}`)
    }
  }

  const handleTimeoutUpdate = async (): Promise<void> => {
    if (!projectPath) return
    try {
      const result = await window.api.updateTimeout(projectPath, timeout)
      if (result.success) {
        toast.success(t('settings.timeout.updateSuccess'))
      } else {
        toast.error(result.error || t('settings.error.unexpected'))
      }
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')}: ${error}`)
    }
  }

  useEffect(() => {
    if (!projectPath) return
    setRunSettings(loadRunSettings(projectPath))
  }, [projectPath])

  useEffect(() => {
    let current = true
    window.api
      .getRunDefaults()
      .then((defaults) => {
        if (current) setRunDefaults(defaults)
      })
      .catch(() => {})
    return (): void => {
      current = false
    }
  }, [])

  // Last results back Re-run failed when the live run has no usable failures; a finished run rewrites them
  useEffect(() => {
    if (!projectPath) return
    let current = true
    loadRaiderResults(projectPath, window.api)
      .then((results) => {
        if (current) setLastResults(results)
      })
      .catch(() => {
        if (current) setLastResults(null)
      })
    return (): void => {
      current = false
    }
  }, [projectPath, projectRunFinishedAt])

  const updateRunSettings = (patch: Partial<RunSettings>): void => {
    if (!projectPath) return
    const next = { ...runSettings, ...patch }
    setRunSettings(next)
    saveRunSettings(projectPath, next)
  }

  const startRun = (scope: RunScope): void => {
    void useRunStore.getState().start(scope, { route: '/overview', label: t('run.originProject') })
  }

  const runModeScope = (): RunScope =>
    runMode === 'all'
      ? { kind: 'all' }
      : { kind: 'tags', tags: [runMode === 'custom' ? customTag.toLowerCase() : runMode] }

  // A custom tag has to be a valid Playwright-style tag name before Run is allowed
  const customTagProblem =
    runMode !== 'custom'
      ? undefined
      : customTag === ''
        ? t('overview.settings.customTagEmpty')
        : TAG_RE.test(customTag.toLowerCase())
          ? undefined
          : t('overview.settings.customTagInvalid')

  const handleRunRaiderTests = (): void => {
    if (runBusy) return
    if (customTagProblem) {
      // Say why nothing ran: show the toolbar and put the cursor in the tag field
      setActiveTab('files')
      setSettingsCollapsed(false)
      setTimeout(() => tagInputRef.current?.focus(), 0)
      return
    }
    startRun(runModeScope())
  }

  const handleRerunFailed = (): void => {
    if (runBusy) return
    const locations = failedLocations(projectRun, lastResults)
    if (locations.length === 0) return
    startRun({ kind: 'locations', locations })
  }

  // The panel only shows Overview's own run, so its scope is the one Overview last started
  const handleRunAgain = (): void => {
    if (runBusy || (!projectRun && customTagProblem)) return
    const flow = projectRun?.finished?.flow
    if (projectRun && flow) {
      // A flow runs again with the inputs it had; after a reload only its recorded ones
      const { lastFlow, origin } = useRunStore.getState()
      void useRunStore
        .getState()
        .start(
          projectRun.scope,
          origin ?? { route: '/overview', label: flow.name },
          lastFlow?.name === flow.name ? lastFlow : { name: flow.name, inputs: {}, headed: false }
        )
      return
    }
    startRun(projectRun?.scope ?? runModeScope())
  }

  const loadFile = async (filePath: string): Promise<void> => {
    const fileName = filePath.split('/').pop() || ''
    setEditingFile({ path: filePath, name: fileName, openId: ++openCount.current })
    setIsLoadingFile(true)
    try {
      const result = await window.api.readFile(filePath)
      if (result.success) {
        setFileContent(result.data || '')
        setSavedContent(result.data || '')
      } else {
        toast.error(t('files.toast.readFailed'))
        setEditingFile(null)
      }
    } catch {
      toast.error(t('files.toast.readError'))
      setEditingFile(null)
    } finally {
      setIsLoadingFile(false)
    }
  }

  /** Asks about unsaved changes first; runs `action` at once when there are none. */
  const guardUnsaved = (action: () => void): void => {
    if (fileDirty) setPendingLeave(() => action)
    else action()
  }

  // The new test form is on the Tests tab; a dirty Files edit asks first
  useEffect(() => {
    if (isNewTestRoute) switchTab('tests')
  }, [isNewTestRoute, locationKey])

  // The notification's Flows tab; a dirty Files edit asks first
  useEffect(() => {
    if (flowsRequested) switchTab('flows')
  }, [flowsRequested, locationKey])

  const handleOpenFile = (filePath: string): void => guardUnsaved(() => void loadFile(filePath))

  // Leaving the Files tab with an unsaved edit asks first, as opening another file does (R1)
  const switchTab = (tab: OverviewTab): void => {
    if (tab === activeTab) return
    guardUnsaved(() => setActiveTab(tab))
  }

  // One write at a time; a ref so a repeat in the same tick can't start a second one
  const savingFileRef = useRef(false)
  // A rename in flight: a save now would write to the old path
  const renamingRef = useRef(false)

  /** Writes the file; true when it is on disk afterwards. */
  const handleSaveFile = useCallback(async (): Promise<boolean> => {
    if (!editingFile) return false
    if (savingFileRef.current || renamingRef.current) return false
    savingFileRef.current = true
    const loadingTypes = ['stashing', 'securing', 'engraving', 'prize', 'ruby']
    const toastId = toast.loading(t(`editor.save.${sample(loadingTypes)}`))
    setIsSavingFile(true)
    try {
      const res = await window.api.editFile(editingFile.path, fileContent)
      if (res.success) {
        setSavedContent(fileContent)
        toast.success(t('editor.success'), { id: toastId })
        return true
      }
      toast.error(t('editor.error.saveFailed', { fileName: editingFile.name }), { id: toastId })
      return false
    } catch {
      toast.error(t('editor.error.unexpectedSaveError'), { id: toastId })
      return false
    } finally {
      savingFileRef.current = false
      setIsSavingFile(false)
    }
  }, [editingFile, fileContent, t])

  // The dialog stays up (and keeps focus from the editor) until the write has finished
  const saveThenLeave = async (): Promise<void> => {
    const action = pendingLeave
    const saved = await handleSaveFile()
    setPendingLeave(null)
    if (saved && action) action()
  }

  const discardThenLeave = (): void => {
    const action = pendingLeave
    setPendingLeave(null)
    setFileContent(savedContent)
    setEditorRevision((n) => n + 1)
    action?.()
  }

  useEffect(() => {
    // Only the file the user can see, only when it has changes, one write at a time
    if (!editingFile || activeTab !== 'files' || !fileDirty || isSavingFile) return
    // Kept: the e2e showed Playwright's synthetic Cmd+S reaches only this listener; whether the
    // native File › Save accelerator also fires on a real keypress is untested; both paths are
    // guarded against a double write.
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void handleSaveFile()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingFile, activeTab, fileDirty, isSavingFile, handleSaveFile])

  // The menu bar's Run runs the project while the Files tab is showing (a test page takes it
  // on the Tests tab); Save writes the open file there
  useEffect(
    () =>
      onMenuCommand((command) => {
        if (activeTab !== 'files') return
        if (command === 'run') handleRunRaiderTests()
        if (command === 'save' && editingFile && fileDirty) void handleSaveFile()
      }),
    [activeTab, editingFile, fileDirty, handleRunRaiderTests, handleSaveFile]
  )

  // A file change can add, move or remove a spec, so the Tests list reloads too
  const reloadFiles = (): void => {
    if (!projectPath) return
    void useProjectStore.getState().loadFiles(projectPath)
    void useTestsListStore.getState().reload()
  }

  /** The message for a refused operation, worded here when main gave a reason code. */
  const failure = (res: { error: string; code?: string }): string =>
    res.code === 'recorded' || res.code === 'tooLarge' || res.code === 'projectChanged'
      ? t(`files.error.${res.code}`)
      : res.error

  // Right-clicks on rows prevent the default first; the tree's own handler only takes the rest
  const handleFileContextMenu = (e: React.MouseEvent, filePath: string, fileName: string): void => {
    e.preventDefault()
    setFileContextMenu({ x: e.clientX, y: e.clientY, filePath, fileName, kind: 'file' })
  }

  const handleFolderContextMenu = (
    e: React.MouseEvent,
    folderPath: string,
    folderName: string
  ): void => {
    e.preventDefault()
    setFileContextMenu({
      x: e.clientX,
      y: e.clientY,
      filePath: folderPath,
      fileName: folderName,
      kind: 'folder'
    })
  }

  // The root row and the empty space under the tree: New file, New folder and Paste at the root
  const handleTreeContextMenu = (e: React.MouseEvent): void => {
    if (e.defaultPrevented || !projectPath) return
    e.preventDefault()
    setFileContextMenu({
      x: e.clientX,
      y: e.clientY,
      filePath: projectPath,
      fileName: '',
      kind: 'root'
    })
  }

  /** The menu's entry as a project-relative path, and the folder that New and Paste target. */
  const menuTarget = (): { rel: string; folderRel: string } | null => {
    if (!fileContextMenu || !projectPath) return null
    if (fileContextMenu.kind === 'root') return { rel: '', folderRel: '' }
    const rel = toProjectRel(projectPath, fileContextMenu.filePath)
    if (!rel) return null
    return { rel, folderRel: fileContextMenu.kind === 'folder' ? rel : parentRel(rel) }
  }

  const handleCopyPath = (): void => {
    if (!fileContextMenu) return
    navigator.clipboard.writeText(fileContextMenu.filePath)
    toast.success(t('files.toast.pathCopied'))
  }

  // Undo runs from a toast after later renders, so it reads the open file from here
  const editingFileRef = useRef(editingFile)
  editingFileRef.current = editingFile
  const fileDirtyRef = useRef(fileDirty)
  fileDirtyRef.current = fileDirty

  /** The editor closes when the open file is gone (a dirty one was warned about first). */
  const closeEditorIfUnder = (abs: string): void => {
    const open = editingFileRef.current
    if (!open || !isUnder(open.path, abs)) return
    setEditingFile(null)
    setFileContent('')
    setSavedContent('')
  }

  /** Moves `rel` to the Trash; true when it went. */
  const trashEntry = async (rel: string, name: string): Promise<boolean> => {
    if (!projectPath) return false
    const res = await window.api.trashProjectEntry(projectPath, rel)
    if (!res.success) {
      toast.error(t('files.toast.trashFailed', { error: failure(res) }))
      return false
    }
    closeEditorIfUnder(toProjectAbs(projectPath, rel))
    useFileClipboardStore.getState().forget(projectPath, rel)
    toast.success(t('files.toast.trashed', { name }))
    reloadFiles()
    return true
  }

  /** Success toast for something new, with Undo that sends it to the Trash. */
  const announceCreated = (message: string, rel: string, skipped = 0): void => {
    const name = rel.split('/').pop() ?? rel
    const full =
      skipped > 0 ? `${message} ${t('files.toast.linksSkipped', { count: skipped })}` : message
    const project = projectPath
    if (project) setRevealPath(toProjectAbs(project, rel))
    successWithUndo(full, () => {
      // Paths are relative to the open project: never undo into another one
      if (!project || useProjectStore.getState().projectPath !== project) return
      const undo = (): void => void trashEntry(rel, name)
      const open = editingFileRef.current
      // Unsaved edits in the file about to go: ask first, as leaving the file would
      if (open && fileDirtyRef.current && isUnder(open.path, toProjectAbs(project, rel)))
        setPendingLeave(() => undo)
      else undo()
    })
  }

  const handleDeleteFile = async (): Promise<void> => {
    if (!fileContextMenu || !projectPath || fileContextMenu.kind === 'root') return
    setDeleteConfirm({ filePath: fileContextMenu.filePath, fileName: fileContextMenu.fileName })
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteConfirm || !projectPath) return
    const { filePath, fileName } = deleteConfirm
    setDeleteConfirm(null)
    const rel = toProjectRel(projectPath, filePath)
    if (rel) await trashEntry(rel, fileName)
  }

  const handleCopyEntry = (): void => {
    const target = menuTarget()
    if (!target || !projectPath || !fileContextMenu || fileContextMenu.kind === 'root') return
    useFileClipboardStore.getState().copy({
      projectPath,
      rel: target.rel,
      name: fileContextMenu.fileName,
      kind: fileContextMenu.kind
    })
    toast.success(t('files.toast.copied', { name: fileContextMenu.fileName }))
  }

  const handlePaste = async (): Promise<void> => {
    const target = menuTarget()
    const copied = copiedIn(useFileClipboardStore.getState(), projectPath)
    if (!target || !copied) return
    if (!projectPath) return
    const res = await window.api.copyProjectEntry(projectPath, copied.rel, target.folderRel)
    if (!res.success) {
      toast.error(
        res.code === 'intoItself'
          ? t('files.toast.pasteIntoItself')
          : t('files.toast.pasteFailed', { error: failure(res) })
      )
      return
    }
    reloadFiles()
    if (res.path)
      announceCreated(t('files.toast.pasted', { name: copied.name }), res.path, res.skipped)
  }

  const handleDuplicateFile = async (): Promise<void> => {
    const target = menuTarget()
    if (!target || !projectPath || !fileContextMenu || fileContextMenu.kind === 'root') return
    const res = await window.api.duplicateProjectEntry(projectPath, target.rel)
    if (!res.success) {
      toast.error(t('files.toast.duplicateFailed', { error: failure(res) }))
      return
    }
    reloadFiles()
    if (res.path)
      announceCreated(
        t('files.toast.duplicated', { name: fileContextMenu.fileName }),
        res.path,
        res.skipped
      )
  }

  const handleStartNew = (kind: 'file' | 'folder'): void => {
    const target = menuTarget()
    if (target) setNameDialog({ mode: kind, folderRel: target.folderRel })
  }

  // New page object… / New spec… / New component… / New helper…: a folder only, not the root
  const handleStartScaffold = (type: FolderScaffoldType): void => {
    const target = menuTarget()
    if (target && fileContextMenu?.kind === 'folder')
      setNameDialog({ mode: 'scaffold', type, folderRel: target.rel })
  }

  /** The name rule of a generated file, and its file already in the folder (any case). */
  const scaffoldNameError = (
    type: FolderScaffoldType,
    folderRel: string,
    name: string
  ): string | null => {
    if (name === '') return t('files.name.empty')
    if (!isScaffoldName(name)) return t('files.scaffold.invalidName')
    const file = scaffoldFileName(type, name).toLowerCase()
    return namesAt(files, folderRel).some((n) => n.toLowerCase() === file)
      ? t('files.name.taken', { name: scaffoldFileName(type, name) })
      : null
  }

  /**
   * Runs `raider g <type> <name> --path <folder>`; main refuses a file that is already there.
   * The new file is revealed in the tree and opened; Undo sends it to the Trash.
   */
  const submitScaffold = async (
    type: FolderScaffoldType,
    folderRel: string,
    name: string
  ): Promise<string | null> => {
    if (!projectPath) return null
    const fileName = scaffoldFileName(type, name)
    let res: Awaited<ReturnType<typeof window.api.scaffoldGenerate>>
    try {
      res = await window.api.scaffoldGenerate(
        { operation: 'generate', type, name, path: folderRel },
        projectPath,
        useRubyStore.getState().rubyCommand ?? ''
      )
    } catch (error) {
      res = { success: false, output: '', error: String(error) }
    }
    if (!res.success) {
      if (res.code === 'exists') return t('files.name.taken', { name: fileName })
      if (res.code === 'invalidName') return t('files.scaffold.invalidName')
      setNameDialog(null)
      toast.error(
        t('files.toast.scaffoldFailed', {
          name: fileName,
          error:
            res.code === 'projectChanged'
              ? t('files.error.projectChanged')
              : res.error || res.output
        })
      )
      return null
    }
    setNameDialog(null)
    reloadFiles()
    const rel = res.files?.[0]
    if (rel) {
      announceCreated(t('files.toast.created', { name: fileName }), rel)
      handleOpenFile(toProjectAbs(projectPath, rel))
    }
    return null
  }

  const handleStartRename = (): void => {
    const target = menuTarget()
    if (!target || !fileContextMenu || fileContextMenu.kind === 'root') return
    setNameDialog({
      mode: 'rename',
      folderRel: parentRel(target.rel),
      rel: target.rel,
      name: fileContextMenu.fileName,
      isFolder: fileContextMenu.kind === 'folder'
    })
  }

  /** The error a refused name dialog shows; null closes the dialog. */
  const nameError = (
    res: { success: false; error: string; code?: string },
    name: string
  ): string =>
    res.code === 'exists'
      ? t('files.name.taken', { name })
      : res.code === 'invalidName'
        ? t('files.name.invalid')
        : failure(res)

  const handleNameSubmit = async (name: string): Promise<string | null> => {
    if (!nameDialog || !projectPath) return null
    if (nameDialog.mode === 'scaffold')
      return submitScaffold(nameDialog.type, nameDialog.folderRel, name)
    if (nameDialog.mode === 'rename') {
      if (name === nameDialog.name) {
        setNameDialog(null)
        return null
      }
      const oldAbs = toProjectAbs(projectPath, nameDialog.rel)
      const holdsOpenFile = !!editingFile && isUnder(editingFile.path, oldAbs)
      // A save in flight would write to the old path after the rename
      if (holdsOpenFile && (isSavingFile || savingFileRef.current)) return t('files.name.saving')
      renamingRef.current = true
      let res: Awaited<ReturnType<typeof window.api.renameProjectEntry>>
      try {
        res = await window.api.renameProjectEntry(projectPath, nameDialog.rel, name)
      } finally {
        renamingRef.current = false
      }
      if (!res.success) return nameError(res, name)
      setNameDialog(null)
      if (res.path) {
        useFileClipboardStore.getState().renamed(projectPath, nameDialog.rel, res.path)
        // The open file keeps its edits (and its editor) under its new path
        if (holdsOpenFile && editingFile) {
          const path = toProjectAbs(projectPath, res.path) + editingFile.path.slice(oldAbs.length)
          setEditingFile({ ...editingFile, path, name: path.split(/[\\/]/).pop() || '' })
        }
      }
      toast.success(t('files.toast.renamed', { name }))
      reloadFiles()
      return null
    }
    const res = await window.api.createProjectEntry(
      projectPath,
      nameDialog.folderRel,
      name,
      nameDialog.mode
    )
    if (!res.success) return nameError(res, name)
    setNameDialog(null)
    reloadFiles()
    if (res.path) {
      announceCreated(t('files.toast.created', { name }), res.path)
      if (nameDialog.mode === 'file') handleOpenFile(toProjectAbs(projectPath, res.path))
    }
    return null
  }

  const copiedEntry = useFileClipboardStore((state) => copiedIn(state, projectPath))
  // Delete asks first; it also warns when the open file has unsaved edits that will go with it
  const deleteLosesEdits =
    !!deleteConfirm &&
    fileDirty &&
    !!editingFile &&
    isUnder(editingFile.path, deleteConfirm.filePath)

  if (mobileProject) return <MobileProjectUnsupported />

  return (
    <div className="flex flex-col w-screen p-8">
      {/* Tabs */}
      <div className="flex items-center border-b border-neutral-bdr mb-4">
        <ProjectMenu />
        <Tooltip content={t('tooltips.overview.tabTests')} position="bottom">
          <button
            onClick={() => switchTab('tests')}
            className={`px-5 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'tests'
                ? 'text-neutral-dark border-b-2 border-ruby'
                : 'text-neutral-md hover:text-neutral-dk'
            }`}
          >
            {t('overview.tabs.tests')}
          </button>
        </Tooltip>
        <Tooltip content={t('tooltips.overview.tabFlows')} position="bottom">
          <button
            onClick={() => switchTab('flows')}
            className={`px-5 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'flows'
                ? 'text-neutral-dark border-b-2 border-ruby'
                : 'text-neutral-md hover:text-neutral-dk'
            }`}
          >
            {t('overview.tabs.flows')}
          </button>
        </Tooltip>
        <Tooltip content={t('tooltips.overview.tabFiles')} position="bottom">
          <button
            onClick={() => switchTab('files')}
            className={`px-5 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'files'
                ? 'text-neutral-dark border-b-2 border-ruby'
                : 'text-neutral-md hover:text-neutral-dk'
            }`}
          >
            {t('overview.tabs.files')}
          </button>
        </Tooltip>
        <Tooltip content={t('tooltips.overview.tabDashboard')} position="bottom">
          <button
            onClick={() => switchTab('dashboard')}
            className={`px-5 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'dashboard'
                ? 'text-neutral-dark border-b-2 border-ruby'
                : 'text-neutral-md hover:text-neutral-dk'
            }`}
          >
            {t('overview.tabs.dashboard')}
          </button>
        </Tooltip>
        <div className="ml-auto flex items-center gap-2">
          {activeTab === 'files' && !terminalOpen && (
            <Tooltip content={t('tooltips.overview.openTerminal')} position="bottom">
              <button
                onClick={() => setTerminalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-dk border border-neutral-bdr rounded hover:bg-neutral-lt transition-colors"
                data-testid="open-terminal-btn"
              >
                <FaTerminal size={10} />
                {t('overview.openTerminal')}
              </button>
            </Tooltip>
          )}
          <InfoButton
            titleKey={`help.overview.${activeTab}.title`}
            messageKey={`help.overview.${activeTab}.message`}
            tooltip={t('tooltips.overview.info')}
            docs={OVERVIEW_DOCS[activeTab](t)}
          />
        </div>
      </div>

      {/* Above the tabs, so the run stays in view when switching tabs mid-run */}
      <div className="mb-4 empty:hidden">
        <RunPanel
          routeKey="/overview"
          onRunAgain={handleRunAgain}
          // A flow has no per-example re-run: it runs again whole, with its inputs
          onRerunFailed={run?.finished?.flow ? undefined : handleRerunFailed}
        />
      </div>

      {isQuick && (
        <div className="flex items-center justify-between gap-4 mb-4 px-4 py-2 rounded-lg border border-neutral-bdr bg-ruby-sub text-sm text-neutral-dk">
          <span>{t('quickRecord.banner')}</span>
          <button
            onClick={() => void handleSaveProjectTo()}
            disabled={saving || recorderBusy}
            title={recorderBusy ? t('quickRecord.stopFirst') : undefined}
            className="px-3 py-1 text-xs font-semibold text-ruby border border-ruby rounded hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('quickRecord.saveTo')}
          </button>
        </div>
      )}

      {activeTab === 'tests' && (
        // The settings take their height; the tests fill the rest of the screen
        <div className="relative w-full flex flex-col h-[calc(100vh-11rem)]">
          <RecordingSettingsPanel
            explicitWait={explicitWait}
            setExplicitWait={setExplicitWait}
            loaded={loaded}
            saveWait={saveWait}
          />
          {/* A project switched in place (the project menu, File › Open recent) gets a fresh list */}
          <TestsWorkspace key={projectPath ?? ''} />
        </div>
      )}

      {activeTab === 'flows' && (
        <div className="relative w-full flex flex-col h-[calc(100vh-11rem)]">
          <FlowsPane key={projectPath ?? ''} />
        </div>
      )}

      {activeTab === 'files' && (
        <div className="relative w-full">
          {/* Test settings toolbar */}
          <div className="border border-neutral-bdr rounded-t-lg bg-neutral-50 px-4 py-3 space-y-2">
            <Tooltip
              content={t(settingsCollapsed ? 'tooltips.overview.settingsExpand' : 'tooltips.overview.settingsCollapse')}
              position="right"
            >
              <button
                onClick={toggleSettings}
                aria-expanded={!settingsCollapsed}
                aria-controls="overview-settings-body"
                className="flex items-center gap-1 text-sm font-semibold text-neutral-dark hover:text-ruby transition-colors"
                data-testid="overview-settings-toggle"
              >
                {settingsCollapsed ? <FaChevronRight size={10} /> : <FaChevronDown size={10} />}
                {t('overview.settings.title')}
              </button>
            </Tooltip>
            {/* Folded, a bad address still says so: its field is hidden, not gone */}
            {settingsCollapsed && urlError && (
              <p className="text-xs text-status-err" data-testid="overview-settings-folded-error">
                {urlError}
              </p>
            )}
            {/* Hidden rather than unmounted: the fields keep their state, refs and focus */}
            <div id="overview-settings-body" className="space-y-2" hidden={settingsCollapsed}>
            {showWebSettings && (
              <Tooltip content={t('tooltips.overview.urlInput')} position="right" className="w-full">
                <div className="flex items-center gap-2 w-full">
                  <label className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                    {t('overview.settings.urlLabel')}:
                  </label>
                  <input
                    type="text"
                    value={browserUrl}
                    onChange={(e) => {
                      setBrowserUrl(e.target.value)
                      setUrlError(null)
                    }}
                    onBlur={handleUrlSave}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleUrlSave()
                    }}
                    placeholder={t('overview.settings.urlPlaceholder')}
                    aria-invalid={urlError ? true : undefined}
                    aria-describedby={urlError ? 'overview-url-error' : undefined}
                    className={`flex-1 border rounded px-2 py-1 text-sm ${urlError ? 'border-status-err' : 'border-neutral-bdr'}`}
                    data-testid="overview-url-input"
                  />
                  {settingsSaved && (
                    <span role="status" className="text-xs text-status-ok whitespace-nowrap">
                      {t('overview.settings.saved')}
                    </span>
                  )}
                </div>
                {urlError && (
                  <p id="overview-url-error" role="alert" className="text-xs text-status-err mt-1">
                    {urlError}
                  </p>
                )}
              </Tooltip>
            )}
            <div className="flex items-center gap-4 flex-wrap">
              {showWebSettings && (
                <Tooltip content={t('tooltips.overview.browserSelect')} position="right">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                      {t('overview.settings.browserLabel')}
                    </label>
                    <select
                      value={selectedBrowser}
                      onChange={handleBrowserChange}
                      className="border border-neutral-bdr rounded px-3 py-1 text-sm min-w-[160px]"
                      data-testid="overview-browser-select"
                    >
                      <option value="chrome">{t('settings.browser.chrome')}</option>
                      <option value="firefox">{t('settings.browser.firefox')}</option>
                      {selectedBrowser !== 'chrome' && selectedBrowser !== 'firefox' && (
                        <option value={selectedBrowser}>{selectedBrowser}</option>
                      )}
                    </select>
                  </div>
                </Tooltip>
              )}
              {showWebSettings && (
                <Tooltip content={t('tooltips.overview.headlessToggle')} position="right">
                  <ToggleSwitch
                    label={t('overview.settings.headlessLabel')}
                    checked={headless}
                    onChange={handleHeadlessToggle}
                    testId="overview-headless-toggle"
                  />
                </Tooltip>
              )}
              <Tooltip content={t('tooltips.overview.runMode')} position="right">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                    {t('overview.settings.runModeLabel')}
                  </label>
                  <select
                    value={runMode}
                    onChange={(e) =>
                      setRunMode(e.target.value as 'all' | 'smoke' | 'regression' | 'custom')
                    }
                    className="border border-neutral-bdr rounded px-3 py-1 text-sm min-w-[140px]"
                    data-testid="overview-run-mode-select"
                  >
                    <option value="all">{t('overview.settings.runMode.all')}</option>
                    <option value="smoke">{t('overview.settings.runMode.smoke')}</option>
                    <option value="regression">{t('overview.settings.runMode.regression')}</option>
                    <option value="custom">{t('overview.settings.runMode.custom')}</option>
                  </select>
                </div>
              </Tooltip>
              {runMode === 'custom' && (
                <input
                  ref={tagInputRef}
                  type="text"
                  autoFocus
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  placeholder={t('overview.settings.customTagPlaceholder')}
                  aria-label={t('overview.settings.customTagLabel')}
                  aria-invalid={customTag !== '' && !!customTagProblem}
                  aria-describedby={
                    customTag !== '' && customTagProblem ? 'overview-run-tag-error' : undefined
                  }
                  className="border border-neutral-bdr rounded px-3 py-1 text-sm w-[140px] lowercase"
                  data-testid="overview-run-tag-input"
                />
              )}
              {runMode === 'custom' && (
                <span
                  id="overview-run-tag-error"
                  className="text-xs text-red-600"
                  aria-live="polite"
                >
                  {customTag !== '' && customTagProblem ? customTagProblem : ''}
                </span>
              )}
              <Tooltip
                content={t('tooltips.overview.rerunFailed')}
                disabledReason={canRerunFailed ? undefined : t('run.nothingFailed')}
                position="right"
              >
                <button
                  onClick={handleRerunFailed}
                  disabled={runBusy || !canRerunFailed}
                  title={canRerunFailed ? t('run.rerunSerial') : t('run.nothingFailed')}
                  className="px-3 py-1 text-sm font-medium text-neutral-dk border border-neutral-bdr rounded hover:bg-neutral-lt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="overview-rerun-failed-btn"
                >
                  {t('overview.settings.rerunFailed')}
                </button>
              </Tooltip>
              <ToggleSwitch
                label={t('run.parallel')}
                tooltip={t('tooltips.files.parallel')}
                checked={runSettings.parallel}
                onChange={(parallel) => updateRunSettings({ parallel })}
                testId="overview-parallel-toggle"
              />
              <Tooltip content={t('tooltips.files.moreOptions')} position="right">
                <button
                  onClick={() => setMoreOptionsOpen((open) => !open)}
                  aria-expanded={moreOptionsOpen}
                  className="flex items-center gap-1 text-sm font-medium text-neutral-dk hover:text-neutral-dark transition-colors"
                  data-testid="overview-more-options"
                >
                  {moreOptionsOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                  {t('run.moreOptions')}
                </button>
              </Tooltip>
              {showWebSettings && (
                <Tooltip content={t('tooltips.overview.timeout')} position="right">
                  <div className="flex items-center gap-2">
                    <label htmlFor="timeout-input" className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                      {t('settings.timeout.label')}
                    </label>
                    <input
                      type="number"
                      id="timeout-input"
                      value={timeout}
                      onChange={(e) => setTimeout_(Number(e.target.value))}
                      onBlur={handleTimeoutUpdate}
                      disabled={!configLoaded}
                      min={1}
                      max={300}
                      className="border border-neutral-bdr rounded px-2 py-1 text-sm w-20"
                    />
                  </div>
                </Tooltip>
              )}
            </div>
            {moreOptionsOpen && (
              <div className="flex items-center gap-4 flex-wrap" data-testid="overview-more-options-panel">
                <div className="flex items-center gap-2">
                  <label htmlFor="workers-input" className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                    {t('run.workers')}
                  </label>
                  <Tooltip content={t('tooltips.files.workers')} position="right">
                    <input
                      type="number"
                      id="workers-input"
                      value={runSettings.workers ?? ''}
                      onChange={(e) => {
                        const value = e.target.valueAsNumber
                        updateRunSettings({
                          workers: Number.isFinite(value) && value >= 1 ? Math.floor(value) : null
                        })
                      }}
                      min={1}
                      max={runDefaults?.maxWorkers}
                    placeholder={runDefaults ? String(runDefaults.recommendedWorkers) : undefined}
                      className="border border-neutral-bdr rounded px-2 py-1 text-sm w-20"
                      data-testid="overview-workers-input"
                    />
                  </Tooltip>
                </div>
                <ToggleSwitch
                  label={t('run.quarantinedFails')}
                  tooltip={t('tooltips.files.quarantinedFails')}
                  checked={runSettings.quarantinedFails}
                  onChange={(quarantinedFails) => updateRunSettings({ quarantinedFails })}
                  testId="overview-quarantined-fails-toggle"
                />
                <>
                  <ToggleSwitch
                    label={t('run.reuseLogins')}
                    tooltip={t('tooltips.files.reuseLogins')}
                    checked={runSettings.reuseLogins}
                    onChange={(reuseLogins) => updateRunSettings({ reuseLogins })}
                    testId="overview-reuse-logins"
                  />
                  <div className="flex flex-col">
                    <label className="flex items-center gap-2 text-sm text-neutral-dk">
                      <Tooltip
                        content={t('tooltips.files.freshLogin')}
                        disabledReason={
                          runSettings.reuseLogins ? undefined : t('tooltips.files.freshLoginOff')
                        }
                        position="right"
                      >
                        <input
                          type="checkbox"
                          checked={freshLoginNext}
                          disabled={!runSettings.reuseLogins}
                          onChange={(e) => setFreshLoginNext(e.target.checked)}
                          data-testid="overview-fresh-login"
                        />
                      </Tooltip>
                      {t('run.freshLoginNext')}
                    </label>
                    <span className="text-xs text-neutral-md">{t('run.freshLoginHint')}</span>
                  </div>
                </>
              </div>
            )}
            {showWebSettings && (
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                  {t('settings.section.browserOptions')}
                </label>
                <div className="flex-1">
                  <TagInput
                    tags={browserOptions}
                    onChange={(tags) => {
                      setBrowserOptions(tags)
                      if (projectPath) {
                        window.api.updateBrowserOptions(projectPath, tags)
                          .then((result) => {
                            if (!result.success) {
                              toast.error(result.error || t('settings.error.unexpected'))
                            }
                          })
                          .catch(() => toast.error(t('settings.error.unexpected')))
                      }
                    }}
                    placeholder={t('settings.browserOptions.placeholder')}
                    disabled={!configLoaded}
                    tooltip={t('tooltips.files.browserOptions')}
                  />
                </div>
              </div>
            )}
            {/* The recorder waits apply to recorded web tests only */}
            <div className="flex items-center gap-4 flex-wrap">
              <Tooltip content={t('tooltips.overview.implicitWait')} position="right">
                <div className="flex items-center gap-2">
                  <label htmlFor="implicit-wait" className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                    {t('settings.recording.implicitWait.label')}
                  </label>
                  <input
                    type="number"
                    id="implicit-wait"
                    value={implicitWait}
                    onChange={(e) => {
                      // An emptied field is not a wait of 0
                      if (e.target.value.trim() === '') return
                      const val = Number(e.target.value)
                      if (val >= 0) setImplicitWait(val)
                    }}
                    onBlur={() => saveWait({ implicitWait })}
                    min="0"
                    className="border border-neutral-bdr rounded px-2 py-1 w-16 text-sm"
                  />
                </div>
              </Tooltip>
              <Tooltip content={t('tooltips.overview.explicitWait')} position="right">
                <div className="flex items-center gap-2">
                  <label htmlFor="explicit-wait" className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                    {t('settings.recording.explicitWait.label')}
                  </label>
                  <input
                    type="number"
                    id="explicit-wait"
                    value={explicitWait}
                    onChange={(e) => {
                      // An emptied field is not a wait of 0
                      if (e.target.value.trim() === '') return
                      const val = Number(e.target.value)
                      if (val >= 0) setExplicitWait(val)
                    }}
                    onBlur={() => saveWait({ explicitWait })}
                    min="0"
                    className="border border-neutral-bdr rounded px-2 py-1 w-16 text-sm"
                  />
                </div>
              </Tooltip>
            </div>
            </div>
          </div>
          <div className={`relative ${settingsCollapsed ? 'h-[calc(100vh-15rem)] min-h-[62vh]' : 'h-[62vh]'} border border-t-0 border-neutral-bdr rounded-b-lg shadow-card flex flex-col bg-white`}>
            {/* Split: file tree left + editor preview right */}
            <div className={`${terminalOpen ? 'h-1/3' : 'flex-1'} flex flex-row min-h-0 overflow-hidden`}>
              {/* File tree - always visible */}
              <div
                className="w-[28%] border-r border-neutral-bdr overflow-y-auto shrink-0"
                data-testid="file-tree"
                onContextMenu={handleTreeContextMenu}
              >
                <Folder
                  name={projectPath ? projectPath.split('/').pop() : ''}
                  path={projectPath || ''}
                  files={files}
                  defaultOpen={true}
                  dirtyPath={fileDirty ? editingFile?.path : undefined}
                  onFileClick={handleOpenFile}
                  isRoot={true}
                  onRunTests={handleRunRaiderTests}
                  runDisabled={runBusy || !!customTagProblem}
                  runDisabledReason={runBusy ? undefined : customTagProblem}
                  onFileContextMenu={handleFileContextMenu}
                  onFolderContextMenu={handleFolderContextMenu}
                  revealPath={revealPath}
                />
              </div>
              {/* Editor preview */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {editingFile ? (
                  <>
                    <EditorSaveBar
                      fileName={editingFile.name}
                      dirty={fileDirty}
                      saving={isSavingFile}
                      onSave={() => void handleSaveFile()}
                    />
                    {isLoadingFile ? (
                      <div className="flex-1 flex items-center justify-center text-neutral-md text-sm">
                        {t('editor.loading')}
                      </div>
                    ) : (
                      <div className="flex-1 overflow-hidden">
                        <Editor
                          key={`${editingFile.openId ?? editingFile.path}:${editorRevision}`}
                          value={fileContent}
                          language={getFileLanguage(editingFile.path)}
                          onChange={(value: string | undefined) => setFileContent(value || '')}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-neutral-md text-sm">
                    {t('files.selectToPreview')}
                    <DocsLink id="docs.testScreen" topic={t('docs.topics.files')}>
                      {t('docs.whatFilesTabDoes')}
                    </DocsLink>
                  </div>
                )}
              </div>
            </div>

            {/* Terminal panel */}
            {terminalOpen && projectPath && (
              <>
                <div className="border-t border-neutral-bdr shrink-0" />
                <div className="flex-1 min-h-0">
                  <Terminal
                    cwd={projectPath}
                    onClose={() => setTerminalOpen(false)}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="relative w-full">
          <div className="relative h-[70vh] border border-neutral-bdr rounded-lg shadow-card overflow-y-auto bg-white p-4">
            <ProjectDashboard />
          </div>
        </div>
      )}

      {/* Context menu of the file tree: a file, a folder, or the root and empty space */}
      {fileContextMenu && (
        <ContextMenu
          x={fileContextMenu.x}
          y={fileContextMenu.y}
          items={[
            { label: t('files.menu.newFile'), onClick: () => handleStartNew('file') },
            { label: t('files.menu.newFolder'), onClick: () => handleStartNew('folder') },
            // Generated files go into a folder: raider g <type> <name> --path <folder>
            ...(fileContextMenu.kind === 'folder'
              ? FOLDER_SCAFFOLD_TYPES.map((type, i) => ({
                  label: t(SCAFFOLD_MENU_LABEL[type]),
                  onClick: () => handleStartScaffold(type),
                  separatorBefore: i === 0
                }))
              : []),
            ...(fileContextMenu.kind === 'root'
              ? []
              : [
                  {
                    label: t('files.menu.copy'),
                    onClick: handleCopyEntry,
                    separatorBefore: fileContextMenu.kind === 'folder'
                  }
                ]),
            {
              label: t('files.menu.paste'),
              onClick: () => void handlePaste(),
              disabled: !copiedEntry
            },
            ...(fileContextMenu.kind === 'root'
              ? []
              : [
                  { label: t('files.menu.duplicate'), onClick: () => void handleDuplicateFile() },
                  { label: t('files.menu.rename'), onClick: handleStartRename },
                  { label: t('files.menu.copyPath'), onClick: handleCopyPath },
                  { label: t('files.menu.delete'), onClick: () => void handleDeleteFile() }
                ])
          ]}
          onClose={() => setFileContextMenu(null)}
        />
      )}

      {/* Delete confirmation: the entry goes to the OS Trash */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('files.delete.title')}
            className="bg-white rounded-lg shadow-lg p-6 w-96"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setDeleteConfirm(null)
              }
            }}
          >
            <h3 className="text-sm font-semibold text-neutral-dark mb-3">
              {t('files.delete.title')}
            </h3>
            <p className="text-sm text-neutral-dk mb-4">
              {t('files.delete.message', { name: deleteConfirm.fileName })}
            </p>
            {deleteLosesEdits && editingFile && (
              <p role="alert" className="text-sm text-red-600 mb-4">
                {t('files.delete.unsaved', { name: editingFile.name })}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 text-sm text-neutral-dk hover:text-neutral-dark"
              >
                {t('files.delete.cancel')}
              </button>
              {/* Focused on open: Enter confirms, Escape cancels */}
              <button
                autoFocus
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700"
              >
                {t('files.delete.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New file, New folder, Rename and the generated files */}
      {nameDialog?.mode === 'scaffold' && (
        <FileNameDialog
          key={`scaffold-${nameDialog.type}`}
          title={t(`files.scaffold.${nameDialog.type}.title`)}
          confirmLabel={t('files.name.create')}
          validate={(name) => scaffoldNameError(nameDialog.type, nameDialog.folderRel, name)}
          preview={(name) =>
            isScaffoldName(name)
              ? t('files.scaffold.preview', {
                  file: scaffoldFileName(nameDialog.type, name),
                  folder: nameDialog.folderRel
                })
              : null
          }
          onSubmit={handleNameSubmit}
          onCancel={() => setNameDialog(null)}
        />
      )}
      {nameDialog && nameDialog.mode !== 'scaffold' && (
        <FileNameDialog
          key={nameDialog.mode}
          title={t(
            nameDialog.mode === 'rename'
              ? 'files.rename.title'
              : nameDialog.mode === 'file'
                ? 'files.newFile.title'
                : 'files.newFolder.title'
          )}
          confirmLabel={t(
            nameDialog.mode === 'rename' ? 'files.rename.confirm' : 'files.name.create'
          )}
          initialValue={nameDialog.mode === 'rename' ? nameDialog.name : ''}
          // Rename selects a file's name without its extension, as Finder does
          selectEnd={
            nameDialog.mode === 'rename' &&
            !nameDialog.isFolder &&
            nameDialog.name.lastIndexOf('.') > 0
              ? nameDialog.name.lastIndexOf('.')
              : undefined
          }
          taken={namesAt(files, nameDialog.folderRel)}
          onSubmit={handleNameSubmit}
          onCancel={() => setNameDialog(null)}
        />
      )}
      {pendingLeave && editingFile && (
        <UnsavedChangesModal
          fileName={editingFile.name}
          onSave={() => void saveThenLeave()}
          onDiscard={discardThenLeave}
          onCancel={() => setPendingLeave(null)}
        />
      )}
    </div>
  )
}

export default Overview
