import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { sample } from 'lodash'
import { FaTerminal } from 'react-icons/fa'
import Folder from '@components/Library/Folder'
import ScaffoldPanel from '@components/ScaffoldPanel'
import ContextMenu from '@components/ContextMenu'
import ToggleSwitch from '@components/ToggleSwitch'
import Button from '@components/Button'
import TagInput from '@components/TagInput'
import ProjectDashboard from '@components/ProjectDashboard'
import Editor from '@components/Editor'
import Terminal from '@components/Terminal'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { FileNode } from '@foundation/Types/fileNode'
import { getFileLanguage } from '@foundation/helpers'

type OverviewTab = 'files' | 'scaffold' | 'dashboard'


const Overview: React.FC = () => {
  const { t } = useTranslation()
  const projectPath: string | null = useProjectStore((state) => state.projectPath)
  const files: FileNode[] = useProjectStore((state) => state.files)
  const { rubyCommand } = useRubyStore()
  const navigate = useNavigate()
  const toastIdRef = useRef<string | null>(null)
  const [activeTab, setActiveTab] = useState<OverviewTab>('files')
  const [runMode, setRunMode] = useState<'all' | 'smoke' | 'regression' | 'custom'>('all')
  const [customTag, setCustomTag] = useState('')

  // Test settings state
  const [browserUrl, setBrowserUrl] = useState('')
  const [selectedBrowser, setSelectedBrowser] = useState('chrome')
  const [headless, setHeadless] = useState(false)

  // Project settings state (migrated from ProjectSettings)
  const [isMobileProject, setIsMobileProject] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [mobileAppiumUrl, setMobileAppiumUrl] = useState('')
  const [mobilePlatformVersion, setMobilePlatformVersion] = useState('')
  const [mobileAutomationName, setMobileAutomationName] = useState('')
  const [mobileDeviceName, setMobileDeviceName] = useState('')
  const [mobileApp, setMobileApp] = useState('')
  const [isUpdatingMobile, setIsUpdatingMobile] = useState(false)
  const [timeout, setTimeout_] = useState(30)
  const [isUpdatingTimeout, setIsUpdatingTimeout] = useState(false)

  const [browserOptions, setBrowserOptions] = useState<string[]>([])
  const [isUpdatingOptions, setIsUpdatingOptions] = useState(false)
  const [isStartingAppium, setIsStartingAppium] = useState(false)
  const [pagePath, setPagePath] = useState('')
  const [specPath, setSpecPath] = useState('')
  const [featurePath, setFeaturePath] = useState('')
  const [helperPath, setHelperPath] = useState('')
  const [isUpdatingPaths, setIsUpdatingPaths] = useState(false)

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    filePath: string
    pageName: string
  } | null>(null)

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
    const loadSettings = async (): Promise<void> => {
      try {
        const result = await window.api.getProjectConfig(projectPath)
        if (result.success && result.config) {
          const { baseUrl, browser, headless: headlessVal } = result.config
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
        // Fallback to localStorage on error
        const storedUrl = localStorage.getItem('browserUrl')
        const storedBrowser = localStorage.getItem('selectedBrowser')
        const storedHeadless = localStorage.getItem('headless')
        if (storedUrl) setBrowserUrl(storedUrl)
        if (storedBrowser) setSelectedBrowser(storedBrowser)
        if (storedHeadless !== null) setHeadless(storedHeadless === 'true')
      }
    }
    void loadSettings()
  }, [projectPath])

  // Load project settings (mobile detection, capabilities)
  useEffect(() => {
    if (!projectPath) return
    const fetchSettings = async (): Promise<void> => {
      try {
        const result = await window.api.isMobileProject(projectPath)
        if (result.success) {
          setIsMobileProject(result.isMobileProject || false)
          if (result.isMobileProject) {
            const storedMobileAppiumUrl = localStorage.getItem('mobileAppiumUrl')
            const storedPlatformVersion = localStorage.getItem('mobilePlatformVersion')
            const storedAutomationName = localStorage.getItem('mobileAutomationName')
            const storedDeviceName = localStorage.getItem('mobileDeviceName')
            const storedMobileApp = localStorage.getItem('mobileApp')

            if (storedMobileAppiumUrl) setMobileAppiumUrl(storedMobileAppiumUrl)
            if (storedPlatformVersion) setMobilePlatformVersion(storedPlatformVersion)
            if (storedAutomationName) setMobileAutomationName(storedAutomationName)
            if (storedDeviceName) setMobileDeviceName(storedDeviceName)
            if (storedMobileApp) setMobileApp(storedMobileApp)

            if (
              !storedMobileAppiumUrl ||
              !storedPlatformVersion ||
              !storedAutomationName ||
              !storedDeviceName ||
              !storedMobileApp
            ) {
              const capResponse = await window.api.getMobileCapabilities(projectPath)
              if (capResponse.success && capResponse.capabilities) {
                const appiumOptions = capResponse.capabilities['appium:options'] as
                  | {
                      url?: string
                      platformVersion?: string
                      automationName?: string
                      deviceName?: string
                      app?: string
                    }
                  | undefined
                if (appiumOptions) {
                  if (!storedMobileAppiumUrl) setMobileAppiumUrl(appiumOptions.url || '')
                  if (!storedPlatformVersion)
                    setMobilePlatformVersion(appiumOptions.platformVersion || '')
                  if (!storedAutomationName)
                    setMobileAutomationName(appiumOptions.automationName || '')
                  if (!storedDeviceName) setMobileDeviceName(appiumOptions.deviceName || '')
                  if (!storedMobileApp) setMobileApp(appiumOptions.app || '')
                }
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch project settings:', error)
      } finally {
        setSettingsLoading(false)
      }
    }
    void fetchSettings()
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
    try {
      const response = await window.api.updateBrowserType(projectPath, browser)
      if (!response.success) {
        toast.error(response.error || t('overview.settings.browserUpdateFailed'))
        return
      }
      localStorage.setItem('selectedBrowser', browser)
      toast.success(t('overview.settings.browserUpdateSuccess'))
    } catch (error) {
      toast.error(`${t('overview.settings.browserUpdateFailed')}: ${(error as Error).message}`)
    }
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

  // Project settings handlers
  const handleMobileSettingsUpdate = async (): Promise<void> => {
    if (!projectPath) return
    setIsUpdatingMobile(true)
    try {
      const capabilities = {
        url: mobileAppiumUrl,
        platformVersion: mobilePlatformVersion,
        automationName: mobileAutomationName,
        deviceName: mobileDeviceName,
        app: mobileApp
      }
      const capsResponse = await window.api.updateMobileCapabilities(projectPath, capabilities)
      if (!capsResponse.success) {
        toast.error(t('settings.error.mobileCapabilitiesUpdateFailed'))
        return
      }
      localStorage.setItem('mobileAppiumUrl', mobileAppiumUrl)
      localStorage.setItem('mobilePlatformVersion', mobilePlatformVersion)
      localStorage.setItem('mobileAutomationName', mobileAutomationName)
      localStorage.setItem('mobileDeviceName', mobileDeviceName)
      localStorage.setItem('mobileApp', mobileApp)
      toast.success(t('settings.mobile.updateSuccess'))
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')} : ${error}`)
    } finally {
      setIsUpdatingMobile(false)
    }
  }

  const handleTimeoutUpdate = async (): Promise<void> => {
    if (!projectPath) return
    setIsUpdatingTimeout(true)
    try {
      const result = await window.api.updateTimeout(projectPath, timeout)
      if (result.success) {
        toast.success(t('settings.timeout.updateSuccess'))
      } else {
        toast.error(result.error || t('settings.error.unexpected'))
      }
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')}: ${error}`)
    } finally {
      setIsUpdatingTimeout(false)
    }
  }


  const handleBrowserOptionsUpdate = async (): Promise<void> => {
    if (!projectPath) return
    setIsUpdatingOptions(true)
    try {
      const result = await window.api.updateBrowserOptions(projectPath, browserOptions)
      if (result.success) {
        toast.success(t('settings.browserOptions.updateSuccess'))
      } else {
        toast.error(result.error || t('settings.error.unexpected'))
      }
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')}: ${error}`)
    } finally {
      setIsUpdatingOptions(false)
    }
  }

  const handleStartAppium = async (): Promise<void> => {
    if (!projectPath) return
    setIsStartingAppium(true)
    try {
      const result = await window.api.startAppium(projectPath)
      if (result.success) {
        toast.success(t('settings.appium.startSuccess'))
      } else {
        toast.error(result.error || t('settings.appium.startFailed'))
      }
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')}: ${error}`)
    } finally {
      setIsStartingAppium(false)
    }
  }

  const handlePathsUpdate = async (): Promise<void> => {
    if (!projectPath) return
    setIsUpdatingPaths(true)
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
          setIsUpdatingPaths(false)
          return
        }
      }
      if (updates.length > 0) {
        toast.success(t('settings.paths.updateSuccess'))
      }
    } catch (error) {
      toast.error(`${t('settings.error.unexpected')}: ${error}`)
    } finally {
      setIsUpdatingPaths(false)
    }
  }

  useEffect(() => {
    const handleStatusUpdate = (
      _event: Electron.IpcRendererEvent,
      { status }: { status: string }
    ): void => {
      const id = toastIdRef.current
      if (!id) return

      if (status === 'installing') {
        toast.loading(t('overview.installingDependencies'), { id })
      } else if (status === 'running') {
        toast.loading(t('overview.running'), { id })
      }
    }

    window.api.onTestRunStatus(handleStatusUpdate)

    return (): void => {
      window.api.removeTestRunStatusListener(handleStatusUpdate)
    }
  }, [t])

  const handleRunRaiderTests = async (): Promise<void> => {
    const toastId = toast.loading(t('overview.starting'))
    toastIdRef.current = toastId

    try {
      let result: { success: boolean; output?: string; error?: string }

      if (runMode === 'all') {
        result = await window.api.runRaiderTests(
          projectPath || '', rubyCommand || '', false
        )
      } else if (runMode === 'custom' && customTag.trim()) {
        result = await window.api.runRakeTask(projectPath || '', rubyCommand || '', customTag.trim())
      } else {
        result = await window.api.runRakeTask(projectPath || '', rubyCommand || '', runMode)
      }

      toastIdRef.current = null
      toast.dismiss(toastId)

      if (!result.success) {
        throw new Error(result.error || 'Test execution failed')
      }

      toast.success(t('overview.runTestsSuccess'))
    } catch (error) {
      toastIdRef.current = null
      if (toastId) toast.dismiss(toastId)
      toast.error(`${t('overview.error.runTests')}: ${(error as Error).message}`)
    }
  }

  const handleRerunFailed = async (): Promise<void> => {
    const toastId = toast.loading(t('overview.rerunning'))
    toastIdRef.current = toastId

    try {
      const result = await window.api.rerunFailedTests(projectPath || '', rubyCommand || '')

      toastIdRef.current = null
      toast.dismiss(toastId)

      if (!result.success) {
        throw new Error(result.error || 'Re-run failed')
      }

      toast.success(t('overview.rerunSuccess'))
    } catch (error) {
      toastIdRef.current = null
      if (toastId) toast.dismiss(toastId)
      toast.error(`${t('overview.error.rerun')}: ${(error as Error).message}`)
    }
  }

  const handleGenerateSpec = (filePath: string, pageName: string): void => {
    const mouseEvent = window.event as MouseEvent | undefined
    setContextMenu({
      x: mouseEvent?.clientX ?? 200,
      y: mouseEvent?.clientY ?? 200,
      filePath,
      pageName
    })
  }

  const handleContextMenuAction = async (): Promise<void> => {
    if (!contextMenu || !projectPath || !rubyCommand) return

    try {
      const res = await window.api.scaffoldGenerate(
        {
          operation: 'generate',
          type: 'spec',
          name: contextMenu.pageName,
          from: contextMenu.filePath,
          ai: true
        },
        projectPath,
        rubyCommand
      )
      if (res.success) {
        toast.success(`Spec generated for ${contextMenu.pageName}`)
        useProjectStore.getState().loadFiles(projectPath)
      } else {
        toast.error(`Failed: ${res.error || res.output}`)
      }
    } catch (error) {
      toast.error(`Error: ${error}`)
    }
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
        <div className="ml-auto">
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
        </div>
      </div>

      {activeTab === 'files' && (
        <div className="relative w-full">
          {/* Test settings toolbar */}
          <div className="border border-neutral-bdr rounded-t-lg bg-neutral-50 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
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
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                  {t('overview.settings.browserLabel')}:
                </label>
                <select
                  value={selectedBrowser}
                  onChange={handleBrowserChange}
                  className="border border-neutral-bdr rounded px-3 py-1 text-sm min-w-[160px]"
                  data-testid="overview-browser-select"
                >
                  <option value="chrome">{t('settings.browser.chrome')}</option>
                  <option value="safari">{t('settings.browser.safari')}</option>
                  <option value="firefox">{t('settings.browser.firefox')}</option>
                  <option value="edge">{t('settings.browser.edge')}</option>
                </select>
              </div>
              <ToggleSwitch
                label={t('overview.settings.headlessLabel')}
                checked={headless}
                onChange={handleHeadlessToggle}
                testId="overview-headless-toggle"
              />
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                  {t('overview.settings.runModeLabel')}:
                </label>
                <select
                  value={runMode}
                  onChange={(e) => setRunMode(e.target.value as 'all' | 'smoke' | 'regression' | 'custom')}
                  className="border border-neutral-bdr rounded px-3 py-1 text-sm min-w-[140px]"
                  data-testid="overview-run-mode-select"
                >
                  <option value="all">{t('overview.settings.runMode.all')}</option>
                  <option value="smoke">{t('overview.settings.runMode.smoke')}</option>
                  <option value="regression">{t('overview.settings.runMode.regression')}</option>
                  <option value="custom">{t('overview.settings.runMode.custom')}</option>
                </select>
                {runMode === 'custom' && (
                  <input
                    type="text"
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    placeholder={t('overview.settings.customTagPlaceholder')}
                    className="border border-neutral-bdr rounded px-2 py-1 text-sm w-32"
                    data-testid="overview-custom-tag-input"
                  />
                )}
              </div>
              <button
                onClick={handleRerunFailed}
                className="px-3 py-1 text-sm font-medium text-neutral-dk border border-neutral-bdr rounded hover:bg-neutral-lt transition-colors"
                data-testid="overview-rerun-failed-btn"
              >
                {t('overview.settings.rerunFailed')}
              </button>
            </div>
            {!isMobileProject && (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label htmlFor="timeout-input" className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                    {t('settings.timeout.label')}:
                  </label>
                  <input
                    type="number"
                    id="timeout-input"
                    value={timeout}
                    onChange={(e) => setTimeout_(Number(e.target.value))}
                    onBlur={handleTimeoutUpdate}
                    min={1}
                    max={300}
                    className="border border-neutral-bdr rounded px-2 py-1 text-sm w-20"
                  />
                  <span className="text-xs text-neutral-mid">s</span>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <label className="text-sm font-medium text-neutral-dk whitespace-nowrap">
                    {t('settings.section.browserOptions')}:
                  </label>
                  <div className="flex-1">
                    <TagInput
                      tags={browserOptions}
                      onChange={(tags) => {
                        setBrowserOptions(tags)
                        if (projectPath) {
                          window.api.updateBrowserOptions(projectPath, tags)
                            .catch(() => toast.error(t('settings.error.unexpected')))
                        }
                      }}
                      placeholder={t('settings.browserOptions.placeholder')}
                    />
                  </div>
                </div>
              </div>
            )}
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
                  onGenerateSpec={handleGenerateSpec}
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

      {/* Context menu for page files (generate spec) */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: `Generate spec from ${contextMenu.pageName}`,
              onClick: handleContextMenuAction
            }
          ]}
          onClose={() => setContextMenu(null)}
        />
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
