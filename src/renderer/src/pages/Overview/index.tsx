import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router'
import toast from 'react-hot-toast'
import { sample } from 'lodash'
import { FaChevronDown, FaChevronRight, FaTerminal } from 'react-icons/fa'
import Folder from '@components/Library/Folder'
import ScaffoldPanel from '@components/ScaffoldPanel'
import ContextMenu from '@components/ContextMenu'
import ToggleSwitch from '@components/ToggleSwitch'
import TagInput from '@components/TagInput'
import ProjectDashboard from '@components/ProjectDashboard'
import Editor from '@components/Editor'
import Terminal from '@components/Terminal'
import Tooltip from '@components/Tooltip'
import TestsWorkspace from '@components/TestsWorkspace'
import InfoButton from '@components/InfoButton'
import RunPanel from '@components/RunPanel'
import useProjectStore from '@foundation/Stores/projectStore'
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
import type { RunDefaults, RunScope } from '@shared/types/runEvents'

type OverviewTab = 'tests' | 'files' | 'scaffold' | 'dashboard'


const Overview: React.FC = () => {
  const { t } = useTranslation()
  const projectPath: string | null = useProjectStore((state) => state.projectPath)
  const files: FileNode[] = useProjectStore((state) => state.files)
  const navigate = useNavigate()
  const { testKey } = useParams()
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

  // A test route always shows the Tests tab
  useEffect(() => {
    if (testKey) setActiveTab('tests')
  }, [testKey])
  const [runMode, setRunMode] = useState<'all' | 'smoke' | 'regression'>('all')

  // Live run state
  const run = useRunStore((state) => state.run)
  const runActive = useRunStore((state) => state.isActive)
  const recorderRunning = useRecorderStore((s) => s.isRunning)
  const runBusy = runActive || recorderRunning
  const [runSettings, setRunSettings] = useState<RunSettings>(() =>
    loadRunSettings(projectPath ?? '')
  )
  const [runDefaults, setRunDefaults] = useState<RunDefaults | null>(null)
  const [moreOptionsOpen, setMoreOptionsOpen] = useState(false)
  const [lastResults, setLastResults] = useState<TestResult[] | null>(null)
  // A run of another project says nothing about this one's failures
  const projectRun = run && run.projectPath === projectPath ? run : null
  const projectRunFinishedAt = projectRun?.finished?.finishedAt ?? null
  const canRerunFailed = failedLocations(projectRun, lastResults).length > 0

  // Test settings state
  const [browserUrl, setBrowserUrl] = useState('')
  const [selectedBrowser, setSelectedBrowser] = useState('chrome')
  const [headless, setHeadless] = useState(false)

  // Project settings state (migrated from ProjectSettings)
  const [isMobileProject, setIsMobileProject] = useState(false)
  const [timeout, setTimeout_] = useState(30)

  const [browserOptions, setBrowserOptions] = useState<string[]>([])
  const [configLoaded, setConfigLoaded] = useState(false)
  // Latest-request-wins token for config loads (project load and browser-change re-fetch)
  const configRequestRef = useRef(0)
  const [pagePath, setPagePath] = useState('')
  const [specPath, setSpecPath] = useState('')
  const [featurePath, setFeaturePath] = useState('')
  const [helperPath, setHelperPath] = useState('')

  // File context menu state
  const [fileContextMenu, setFileContextMenu] = useState<{
    x: number
    y: number
    filePath: string
    fileName: string
  } | null>(null)
  const [renameTarget, setRenameTarget] = useState<{ filePath: string; fileName: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<{ filePath: string; fileName: string } | null>(null)

  // Terminal state
  const [terminalOpen, setTerminalOpen] = useState(false)

  // Inline editor state
  const [editingFile, setEditingFile] = useState<{ path: string; name: string } | null>(null)
  const [fileContent, setFileContent] = useState('')
  const [isLoadingFile, setIsLoadingFile] = useState(false)

  useEffect(() => {
    if (!projectPath) {
      navigate('/start-project')
    }
  }, [projectPath, navigate])

  // Load test settings from config files, falling back to localStorage
  useEffect(() => {
    if (!projectPath) return
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
            setBrowserUrl(baseUrl)
            localStorage.setItem('browserUrl', baseUrl)
          } else {
            const storedUrl = localStorage.getItem('browserUrl')
            if (storedUrl) setBrowserUrl(storedUrl)
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
          if (storedUrl) setBrowserUrl(storedUrl)
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
        if (storedUrl) setBrowserUrl(storedUrl)
        if (storedBrowser) setSelectedBrowser(storedBrowser)
        if (storedHeadless !== null) setHeadless(storedHeadless === 'true')
      }
    }
    void loadSettings().finally(() => {
      if (isCurrent()) setConfigLoaded(true)
    })
  }, [projectPath])

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

  // Detect mobile project
  useEffect(() => {
    if (!projectPath) return
    window.api.isMobileProject(projectPath)
      .then((result) => {
        if (result.success) setIsMobileProject(result.isMobileProject || false)
      })
      .catch(() => {})
  }, [projectPath])

  const handleUrlSave = async (): Promise<void> => {
    if (!projectPath) {
      toast.error(t('settings.noProject.description'))
      return
    }
    if (!browserUrl.trim()) return
    try {
      const response = await window.api.updateBrowserUrl(projectPath, browserUrl)
      if (!response.success) {
        toast.error(response.error || t('overview.settings.urlUpdateFailed'))
        return
      }
      localStorage.setItem('browserUrl', browserUrl)
      toast.success(t('overview.settings.urlUpdateSuccess'))
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
      toast.success(t('overview.settings.browserUpdateSuccess'))
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
      toast.success(t('overview.settings.headlessUpdateSuccess'))
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

  const handlePathsUpdate = async (): Promise<void> => {
    if (!projectPath) return
    try {
      const updates: { value: string; type?: 'feature' | 'spec' | 'helper' }[] = []
      if (pagePath.trim()) updates.push({ value: pagePath.trim() })
      if (featurePath.trim()) updates.push({ value: featurePath.trim(), type: 'feature' })
      if (specPath.trim()) updates.push({ value: specPath.trim(), type: 'spec' })
      if (helperPath.trim()) updates.push({ value: helperPath.trim(), type: 'helper' })

      for (const update of updates) {
        const result = await window.api.updatePaths(projectPath, update.value, update.type)
        if (!result.success) {
          toast.error(result.error || t('settings.error.unexpected'))
          return
        }
      }
      if (updates.length > 0) {
        toast.success(t('settings.paths.updateSuccess'))
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
    runMode === 'all' ? { kind: 'all' } : { kind: 'tags', tags: [runMode] }

  const handleRunRaiderTests = (): void => {
    if (runBusy) return
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
    if (runBusy) return
    startRun(projectRun?.scope ?? runModeScope())
  }

  const handleOpenFile = async (filePath: string): Promise<void> => {
    const fileName = filePath.split('/').pop() || ''
    setEditingFile({ path: filePath, name: fileName })
    setIsLoadingFile(true)
    try {
      const result = await window.api.readFile(filePath)
      if (result.success) {
        setFileContent(result.data || '')
      } else {
        toast.error('Failed to read file')
        setEditingFile(null)
      }
    } catch {
      toast.error('Error reading file')
      setEditingFile(null)
    } finally {
      setIsLoadingFile(false)
    }
  }

  const handleSaveFile = useCallback(async (): Promise<void> => {
    if (!editingFile) return
    const loadingTypes = ['stashing', 'securing', 'engraving', 'prize', 'ruby']
    const toastId = toast.loading(t(`editor.save.${sample(loadingTypes)}`))
    try {
      const res = await window.api.editFile(editingFile.path, fileContent)
      if (res.success) {
        toast.success(t('editor.success'), { id: toastId })
      } else {
        toast.error(t('editor.error.saveFailed', { fileName: editingFile.name }), { id: toastId })
      }
    } catch {
      toast.error(t('editor.error.unexpectedSaveError'), { id: toastId })
    }
  }, [editingFile, fileContent, t])

  useEffect(() => {
    if (!editingFile) return
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSaveFile()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingFile, handleSaveFile])

  const handleFileContextMenu = (e: React.MouseEvent, filePath: string, fileName: string): void => {
    e.preventDefault()
    setFileContextMenu({ x: e.clientX, y: e.clientY, filePath, fileName })
  }

  const handleFolderContextMenu = (e: React.MouseEvent, folderPath: string, folderName: string): void => {
    e.preventDefault()
    // Reuse the same fileContextMenu state — folders support the same operations
    setFileContextMenu({ x: e.clientX, y: e.clientY, filePath: folderPath, fileName: folderName })
  }

  const handleCopyPath = (): void => {
    if (!fileContextMenu) return
    navigator.clipboard.writeText(fileContextMenu.filePath)
    toast.success('Path copied to clipboard')
  }

  const handleDeleteFile = async (): Promise<void> => {
    if (!fileContextMenu || !projectPath) return
    setDeleteConfirm({ filePath: fileContextMenu.filePath, fileName: fileContextMenu.fileName })
  }

  const handleConfirmDelete = async (): Promise<void> => {
    if (!deleteConfirm || !projectPath) return
    const { filePath, fileName } = deleteConfirm
    setDeleteConfirm(null)
    const res = await window.api.deleteFile(filePath)
    if (res.success) {
      toast.success(`Deleted ${fileName}`)
      useProjectStore.getState().loadFiles(projectPath)
    } else {
      toast.error(`Failed to delete: ${res.error}`)
    }
  }

  const handleDuplicateFile = async (): Promise<void> => {
    if (!fileContextMenu || !projectPath) return
    const res = await window.api.duplicateFile(fileContextMenu.filePath)
    if (res.success) {
      toast.success(`Duplicated ${fileContextMenu.fileName}`)
      useProjectStore.getState().loadFiles(projectPath)
    } else {
      toast.error(`Failed to duplicate: ${res.error}`)
    }
  }

  const handleStartRename = (): void => {
    if (!fileContextMenu) return
    setRenameTarget({ filePath: fileContextMenu.filePath, fileName: fileContextMenu.fileName })
    setRenameValue(fileContextMenu.fileName)
  }

  const handleRenameSubmit = async (): Promise<void> => {
    if (!renameTarget || !projectPath || !renameValue.trim()) {
      setRenameTarget(null)
      return
    }
    if (renameValue.trim() === renameTarget.fileName) {
      setRenameTarget(null)
      return
    }

    const res = await window.api.renameFile(renameTarget.filePath, renameValue.trim())
    if (res.success) {
      toast.success(`Renamed to ${renameValue.trim()}`)
      useProjectStore.getState().loadFiles(projectPath)
    } else {
      toast.error(`Failed to rename: ${res.error}`)
    }
    setRenameTarget(null)
  }

  return (
    <div className="flex flex-col w-screen p-8">
      {/* Tabs */}
      <div className="flex items-center border-b border-neutral-bdr mb-4">
        <button
          onClick={() => setActiveTab('tests')}
          className={`px-5 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'tests'
              ? 'text-neutral-dark border-b-2 border-ruby'
              : 'text-neutral-mid hover:text-neutral-dk'
          }`}
        >
          {t('overview.tabs.tests')}
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`px-5 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'files'
              ? 'text-neutral-dark border-b-2 border-ruby'
              : 'text-neutral-mid hover:text-neutral-dk'
          }`}
        >
          {t('overview.tabs.files')}
        </button>
        <button
          onClick={() => setActiveTab('scaffold')}
          className={`px-5 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'scaffold'
              ? 'text-neutral-dark border-b-2 border-ruby'
              : 'text-neutral-mid hover:text-neutral-dk'
          }`}
        >
          Scaffolding
        </button>
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-5 py-2 text-sm font-semibold transition-colors ${
            activeTab === 'dashboard'
              ? 'text-neutral-dark border-b-2 border-ruby'
              : 'text-neutral-mid hover:text-neutral-dk'
          }`}
        >
          {t('overview.tabs.dashboard')}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {activeTab === 'files' && !terminalOpen && (
            <button
              onClick={() => setTerminalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-dk border border-neutral-bdr rounded hover:bg-neutral-lt transition-colors"
              data-testid="open-terminal-btn"
            >
              <FaTerminal size={10} />
              Open Terminal
            </button>
          )}
          <InfoButton
            titleKey={`help.overview.${activeTab}.title`}
            messageKey={`help.overview.${activeTab}.message`}
          />
        </div>
      </div>

      {/* Above the tabs, so the run stays in view when switching tabs mid-run */}
      <div className="mb-4 empty:hidden">
        <RunPanel
          routeKey="/overview"
          onRunAgain={handleRunAgain}
          onRerunFailed={handleRerunFailed}
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
        <div className="relative w-full">
          <TestsWorkspace />
        </div>
      )}

      {activeTab === 'files' && (
        <div className="relative w-full">
          {/* Test settings toolbar */}
          <div className="border border-neutral-bdr rounded-t-lg bg-neutral-50 px-4 py-3 space-y-2">
            <Tooltip content={t('tooltips.overview.urlInput')} position="right" className="w-full">
              <div className="flex items-center gap-2 w-full">
                <label className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                  {t('overview.settings.urlLabel')}:
                </label>
                <input
                  type="text"
                  value={browserUrl}
                  onChange={(e) => setBrowserUrl(e.target.value)}
                  onBlur={handleUrlSave}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUrlSave()
                  }}
                  placeholder={t('overview.settings.urlPlaceholder')}
                  className="flex-1 border border-neutral-bdr rounded px-2 py-1 text-sm"
                  data-testid="overview-url-input"
                />
              </div>
            </Tooltip>
            <div className="flex items-center gap-4 flex-wrap">
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
              <Tooltip content={t('tooltips.overview.headlessToggle')} position="right">
                <ToggleSwitch
                  label={t('overview.settings.headlessLabel')}
                  checked={headless}
                  onChange={handleHeadlessToggle}
                  testId="overview-headless-toggle"
                />
              </Tooltip>
              <Tooltip content={t('tooltips.overview.runMode')} position="right">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                    {t('overview.settings.runModeLabel')}
                  </label>
                  <select
                    value={runMode}
                    onChange={(e) => setRunMode(e.target.value as 'all' | 'smoke' | 'regression')}
                    className="border border-neutral-bdr rounded px-3 py-1 text-sm min-w-[140px]"
                    data-testid="overview-run-mode-select"
                  >
                    <option value="all">{t('overview.settings.runMode.all')}</option>
                    <option value="smoke">{t('overview.settings.runMode.smoke')}</option>
                    <option value="regression">{t('overview.settings.runMode.regression')}</option>
                  </select>
                </div>
              </Tooltip>
              <Tooltip content={t('tooltips.overview.rerunFailed')} position="right">
                <button
                  onClick={handleRerunFailed}
                  disabled={runBusy || !canRerunFailed}
                  title={canRerunFailed ? undefined : t('run.nothingFailed')}
                  className="px-3 py-1 text-sm font-medium text-neutral-dk border border-neutral-bdr rounded hover:bg-neutral-lt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="overview-rerun-failed-btn"
                >
                  {t('overview.settings.rerunFailed')}
                </button>
              </Tooltip>
              <ToggleSwitch
                label={t('run.parallel')}
                checked={runSettings.parallel}
                onChange={(parallel) => updateRunSettings({ parallel })}
                testId="overview-parallel-toggle"
              />
              <button
                onClick={() => setMoreOptionsOpen((open) => !open)}
                aria-expanded={moreOptionsOpen}
                className="flex items-center gap-1 text-sm font-medium text-neutral-dk hover:text-neutral-dark transition-colors"
                data-testid="overview-more-options"
              >
                {moreOptionsOpen ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
                {t('run.moreOptions')}
              </button>
              {!isMobileProject && (
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
                </div>
                <ToggleSwitch
                  label={t('run.quarantinedFails')}
                  checked={runSettings.quarantinedFails}
                  onChange={(quarantinedFails) => updateRunSettings({ quarantinedFails })}
                  testId="overview-quarantined-fails-toggle"
                />
              </div>
            )}
            {!isMobileProject && (
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
                  />
                </div>
              </div>
            )}
            <div className="flex items-center gap-4 flex-wrap">
              <Tooltip content={t('tooltips.recorder.implicitWait')} position="right">
                <div className="flex items-center gap-2">
                  <label htmlFor="implicit-wait" className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                    {t('settings.recording.implicitWait.label')}
                  </label>
                  <input
                    type="number"
                    id="implicit-wait"
                    value={implicitWait}
                    onChange={(e) => {
                      const val = Number(e.target.value)
                      if (val >= 0) setImplicitWait(val)
                    }}
                    onBlur={() => saveWait({ implicitWait })}
                    min="0"
                    className="border border-neutral-bdr rounded px-2 py-1 w-16 text-sm"
                  />
                </div>
              </Tooltip>
              <Tooltip content={t('tooltips.recorder.explicitWait')} position="right">
                <div className="flex items-center gap-2">
                  <label htmlFor="explicit-wait" className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                    {t('settings.recording.explicitWait.label')}
                  </label>
                  <input
                    type="number"
                    id="explicit-wait"
                    value={explicitWait}
                    onChange={(e) => {
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
          <div className="relative h-[62vh] border border-t-0 border-neutral-bdr rounded-b-lg shadow-card flex flex-col bg-white">
            {/* Split: file tree left + editor preview right */}
            <div className={`${terminalOpen ? 'h-1/3' : 'flex-1'} flex flex-row min-h-0 overflow-hidden`}>
              {/* File tree - always visible */}
              <div className="w-[28%] border-r border-neutral-bdr overflow-y-auto shrink-0">
                <Folder
                  name={projectPath ? projectPath.split('/').pop() : ''}
                  path={projectPath || ''}
                  files={files}
                  defaultOpen={true}
                  onFileClick={handleOpenFile}
                  isRoot={true}
                  onRunTests={handleRunRaiderTests}
                  runDisabled={runBusy}
                  onFileContextMenu={handleFileContextMenu}
                  onFolderContextMenu={handleFolderContextMenu}
                />
              </div>
              {/* Editor preview */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {editingFile ? (
                  <>
                    <div className="flex items-center px-4 py-2 border-b border-neutral-bdr shrink-0">
                      <span className="text-sm font-semibold text-neutral-dark truncate">{editingFile.name}</span>
                    </div>
                    {isLoadingFile ? (
                      <div className="flex-1 flex items-center justify-center text-neutral-mid text-sm">
                        {t('editor.loading')}
                      </div>
                    ) : (
                      <div className="flex-1 overflow-hidden">
                        <Editor
                          value={fileContent}
                          language={getFileLanguage(editingFile.path)}
                          onChange={(value: string | undefined) => setFileContent(value || '')}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-neutral-mid text-sm">
                    Select a file to preview
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

      {activeTab === 'scaffold' && (
        <div className="relative w-full">
          <div className="relative h-[70vh] border border-neutral-bdr rounded-lg shadow-card overflow-y-auto bg-white p-4 flex gap-8">
            <div className="flex-1">
              <ScaffoldPanel />
            </div>
            <div className="w-64 shrink-0 border-l border-neutral-bdr pl-8">
              <h3 className="text-sm font-semibold text-neutral-dark mb-3">{t('settings.section.paths')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-neutral-dk block mb-1">{t('settings.paths.page')}</label>
                  <input type="text" value={pagePath} onChange={(e) => setPagePath(e.target.value)} onBlur={handlePathsUpdate} placeholder="e.g. pages" className="border border-neutral-bdr rounded px-2 py-1 text-sm w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-dk block mb-1">{t('settings.paths.feature')}</label>
                  <input type="text" value={featurePath} onChange={(e) => setFeaturePath(e.target.value)} onBlur={handlePathsUpdate} placeholder="e.g. features" className="border border-neutral-bdr rounded px-2 py-1 text-sm w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-dk block mb-1">{t('settings.paths.spec')}</label>
                  <input type="text" value={specPath} onChange={(e) => setSpecPath(e.target.value)} onBlur={handlePathsUpdate} placeholder="e.g. spec" className="border border-neutral-bdr rounded px-2 py-1 text-sm w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-neutral-dk block mb-1">{t('settings.paths.helper')}</label>
                  <input type="text" value={helperPath} onChange={(e) => setHelperPath(e.target.value)} onBlur={handlePathsUpdate} placeholder="e.g. helpers" className="border border-neutral-bdr rounded px-2 py-1 text-sm w-full" />
                </div>
              </div>
            </div>
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

      {/* Context menu for all files (copy/rename/delete) */}
      {fileContextMenu && (
        <ContextMenu
          x={fileContextMenu.x}
          y={fileContextMenu.y}
          items={[
            { label: 'Copy Path', onClick: handleCopyPath },
            { label: 'Rename', onClick: handleStartRename },
            { label: 'Duplicate', onClick: handleDuplicateFile },
            { label: 'Delete', onClick: handleDeleteFile }
          ]}
          onClose={() => setFileContextMenu(null)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h3 className="text-sm font-semibold text-neutral-dark mb-3">Confirm Delete</h3>
            <p className="text-sm text-neutral-dk mb-4">
              Are you sure you want to delete &ldquo;{deleteConfirm.fileName}&rdquo;? This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 text-sm text-neutral-dk hover:text-neutral-dark"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename dialog */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h3 className="text-sm font-semibold text-neutral-dark mb-3">Rename File</h3>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit()
                if (e.key === 'Escape') setRenameTarget(null)
              }}
              autoFocus
              className="w-full px-3 py-2 border border-neutral-bdr rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setRenameTarget(null)}
                className="px-3 py-1.5 text-sm text-neutral-dk hover:text-neutral-dark"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Overview
