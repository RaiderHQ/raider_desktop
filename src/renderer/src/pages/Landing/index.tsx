import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import Logo from '@components/Logo'
import Tooltip from '@components/Tooltip'
import Button from '@components/Button'
import QuickRecordDialog from '@components/QuickRecordDialog'
import RubyInstallModal from '@components/RubyInstallModal'
import RubyGemsInstallModal from '@components/RubyGemsInstallModal'
import useLoadingStore from '@foundation/Stores/loadingStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useVersionStore, { supportsRuntime } from '@foundation/Stores/versionStore'
import useOverlayStore from '@foundation/Stores/overlayStore'
import { platformFrom, shortcutLabel, SHORTCUTS } from '@shared/shortcuts'
import type { ShortcutId } from '@shared/shortcuts'
import type { QuickProject } from '@shared/types/quickProject'
import type { RecentProjectEntry } from '@shared/types/recentProject'

/** Where Ruby and the gem stand, from what the startup check and `raider version` answered */
type Setup =
  | { kind: 'checking' }
  | { kind: 'checkFailed' }
  | { kind: 'noRuby' }
  | { kind: 'missingGems'; gems: string[] }
  | { kind: 'noRaider' }
  | { kind: 'tooOld'; version: string }
  | { kind: 'ready'; ruby: string; raider: string }

const setupFrom = (state: {
  checked: boolean
  checkFailed: boolean
  versionRead: boolean
  rubyCommand: string | null
  rubyVersion: string | null
  missingGems: string[]
  version: string | null
}): Setup => {
  if (!state.checked || !state.versionRead) return { kind: 'checking' }
  // A check that threw says nothing about Ruby, so it is not "no Ruby"
  if (state.checkFailed) return { kind: 'checkFailed' }
  // Missing gems come first: on Windows the check gives no command while gems are missing
  if (state.missingGems.length > 0) return { kind: 'missingGems', gems: state.missingGems }
  if (!state.rubyCommand) return { kind: 'noRuby' }
  if (state.version === null) return { kind: 'noRaider' }
  // raider new on an older gem writes a 3.x project the desktop can neither record into nor run
  if (!supportsRuntime(state.version)) return { kind: 'tooOld', version: state.version }
  return { kind: 'ready', ruby: state.rubyVersion ?? '', raider: state.version }
}

const Landing: React.FC = (): JSX.Element => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [quickRecordOpen, setQuickRecordOpen] = useState(false)

  // The setup line: Ruby from the startup check, the gem from `raider version`, read again here
  // because the user may have installed it since
  const { checked, checkFailed, rechecking, rubyCommand, rubyVersion, missingGems } = useRubyStore()
  const gemVersion = useVersionStore((state) => state.version)
  // A version already read shows at once and refreshes quietly; an unknown one is waited for
  const [versionRead, setVersionRead] = useState(() => gemVersion !== null)
  const [fixOpen, setFixOpen] = useState<'ruby' | 'gems' | null>(null)
  useEffect(() => {
    let current = true
    void useVersionStore
      .getState()
      .loadVersion()
      .finally(() => {
        if (current) setVersionRead(true)
      })
    return (): void => {
      current = false
    }
  }, [])
  const setup = rechecking
    ? ({ kind: 'checking' } as Setup)
    : setupFrom({
        checked,
        checkFailed,
        versionRead,
        rubyCommand,
        rubyVersion,
        missingGems,
        version: gemVersion
      })
  const ready = setup.kind === 'ready'

  // The menu bar stands down while this page shows a modal of its own
  const pageModalOpen = quickRecordOpen || fixOpen !== null
  useEffect(() => {
    useOverlayStore.getState().setPageModalOpen(pageModalOpen)
  }, [pageModalOpen])
  useEffect(() => (): void => useOverlayStore.getState().setPageModalOpen(false), [])

  /** After a Fix… modal: the same check as at startup, then the gem version (shared with startup) */
  const recheck = (): void => {
    void useRubyStore.getState().recheck()
  }

  // An old or unreadable gem is fixed the same way as a missing one: gem install ruby_raider
  const gemsToInstall = setup.kind === 'missingGems' ? setup.gems : ['ruby_raider']

  const setLoading: (loading: boolean) => void = useLoadingStore(
    (state: { setLoading: (loading: boolean) => void }) => state.setLoading
  )
  const setProjectPath: (path: string) => void = useProjectStore(
    (state: { setProjectPath: (path: string) => void }) => state.setProjectPath
  )

  // Quick recordings not saved to a folder yet, so they can be found again
  const [quickProjects, setQuickProjects] = useState<QuickProject[]>([])
  useEffect(() => {
    let current = true
    Promise.resolve(window.api.listQuickProjects())
      .then((projects) => {
        if (current) setQuickProjects(projects ?? [])
      })
      .catch((error: unknown) => console.error('Listing the quick recordings failed:', error))
    return (): void => {
      current = false
    }
  }, [])

  // Projects opened with Raider on this computer; main keeps the list (U8)
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>([])
  useEffect(() => {
    let current = true
    Promise.resolve(window.api.listRecentProjects())
      .then((projects) => {
        if (current) setRecentProjects(projects ?? [])
      })
      .catch((error: unknown) => console.error('Listing the recent projects failed:', error))
    return (): void => {
      current = false
    }
  }, [])

  // A remembered folder opens with no folder dialog; main checks it as it does for any open
  const openRecentProject = (project: RecentProjectEntry): void => {
    setProjectPath(project.path)
    navigate('/overview')
  }

  const removeRecentProject = async (project: RecentProjectEntry): Promise<void> => {
    try {
      setRecentProjects(await window.api.removeRecentProject(project.path))
    } catch (error) {
      console.error('Removing the recent project failed:', error)
    }
  }

  // Opens like a new quick recording does: on its tests, with the Save project to… banner
  const openQuickProject = (project: QuickProject): void => {
    setProjectPath(project.path)
    navigate('/overview/tests')
  }

  const platform = platformFrom(navigator.platform)
  // The chip is for the eye; the button announces the shortcut itself
  const shortcutChip = (id: ShortcutId): JSX.Element => (
    <kbd aria-hidden="true" className="font-sans text-xs font-normal text-neutral-md">
      {shortcutLabel(id, platform)}
    </kbd>
  )
  /** aria-keyshortcuts wants Meta / Control, not CmdOrCtrl */
  const keyShortcuts = (id: ShortcutId): string =>
    SHORTCUTS[id].accelerator.replace('CmdOrCtrl', platform === 'mac' ? 'Meta' : 'Control')

  const handleOpenProject = async (): Promise<void> => {
    try {
      setLoading(true)
      const folder = await window.api.selectFolder(t('landing.error.selectFolder'))

      if (!folder) {
        toast(t('landing.error.noFolderSelected'), { icon: 'ℹ️' })
        return
      }

      setProjectPath(folder)
      navigate('/overview')
    } catch (error) {
      toast.error(t('landing.error.openProject'))
    } finally {
      setLoading(false)
    }
  }

  const hasRecents = recentProjects.length > 0 || quickProjects.length > 0

  const setupMessage = ((): string => {
    switch (setup.kind) {
      case 'checking':
        return t('landing.setup.checking')
      case 'checkFailed':
        return t('landing.setup.checkFailed')
      case 'noRuby':
        return t('landing.setup.noRuby')
      case 'missingGems':
        return t('landing.setup.missingGems', { gems: setup.gems.join(', ') })
      case 'noRaider':
        return t('landing.setup.noRaider')
      case 'tooOld':
        return t('landing.setup.tooOld', { version: setup.version })
      case 'ready':
        return t('landing.setup.ready', { ruby: setup.ruby, raider: setup.raider })
    }
  })()
  const notReadyReason =
    setup.kind === 'checking' ? t('landing.start.checking') : t('landing.start.notReady')

  const setupLine = (
    <div
      data-testid="setup-line"
      role="status"
      className={`flex items-center gap-3 text-sm ${hasRecents ? '' : 'justify-center'}`}
    >
      <span
        id="landing-setup"
        className={
          ready
            ? 'text-status-ok'
            : setup.kind === 'checking'
              ? 'text-neutral-md'
              : 'text-neutral-dk'
        }
      >
        {setupMessage}
      </span>
      {!ready && setup.kind !== 'checking' && (
        <button
          onClick={() =>
            setup.kind === 'checkFailed'
              ? recheck()
              : setFixOpen(setup.kind === 'noRuby' ? 'ruby' : 'gems')
          }
          className="text-sm px-2.5 py-1 rounded-md border border-neutral-bdr bg-white font-semibold text-ruby hover:bg-ruby-sub transition-colors"
        >
          {t(setup.kind === 'checkFailed' ? 'landing.setup.retry' : 'landing.setup.fix')}
        </button>
      )}
    </div>
  )

  const recordButton = (large: boolean): JSX.Element => (
    <Tooltip
      content={t('tooltips.landing.quickRecord')}
      disabledReason={ready ? undefined : notReadyReason}
      position="bottom"
    >
      <Button
        onClick={() => setQuickRecordOpen(true)}
        disabled={!ready}
        className={large ? 'min-w-[260px] px-8 py-3.5 text-base' : ''}
        aria-describedby={large ? 'landing-record-hint' : 'landing-setup'}
      >
        {t('landing.start.record')}
      </Button>
    </Tooltip>
  )

  const secondaryButtons = (
    <>
      <Tooltip content={t('tooltips.landing.create')} position="bottom">
        <Button
          type="secondary"
          onClick={() => navigate('/new')}
          aria-keyshortcuts={keyShortcuts('new-project')}
        >
          {t('landing.start.newProject')}
          {shortcutChip('new-project')}
        </Button>
      </Tooltip>
      <Tooltip content={t('tooltips.landing.open')} position="bottom">
        <Button
          type="secondary"
          onClick={() => void handleOpenProject()}
          aria-keyshortcuts={keyShortcuts('open-project')}
        >
          {t('landing.start.openProject')}
          {shortcutChip('open-project')}
        </Button>
      </Tooltip>
    </>
  )

  const howItWorks = (
    <button
      onClick={() => useOverlayStore.getState().requestConcepts()}
      className="text-sm text-ruby hover:underline focus:outline-none focus-visible:underline"
    >
      {t('header.howItWorks')}
    </button>
  )

  return (
    <div className="w-full flex flex-col items-center px-4">
      {hasRecents ? (
        // A returning user: their projects first, the start as one compact row above them
        <div data-testid="landing" data-layout="recents" className="w-full max-w-xl flex flex-col">
          <h1 className="text-2xl font-bold text-neutral-dark mb-3">{t('landing.title')}</h1>
          {setupLine}
          <div data-testid="start-row" className="flex flex-wrap items-center gap-3 mt-4 mb-2">
            {recordButton(false)}
            {secondaryButtons}
          </div>
          {/* A disabled button cannot be focused, so its reason is text as well as a tooltip */}
          {!ready && <p className="text-sm text-neutral-md mb-2">{notReadyReason}</p>}
          <div className="mb-8">{howItWorks}</div>
          {recentProjects.length > 0 && (
            <section aria-labelledby="recent-projects" className="w-full mb-8">
              <h2 id="recent-projects" className="text-lg font-semibold text-neutral-dark">
                {t('landing.recentProjects.title')}
              </h2>
              <p className="text-sm text-neutral-md mb-3">{t('landing.recentProjects.hint')}</p>
              <ul className="border border-neutral-bdr rounded-lg bg-white shadow-card divide-y divide-neutral-bdr">
                {recentProjects.map((project) => (
                  <li
                    key={project.path}
                    className={`flex items-center gap-2 pr-2 ${project.exists && project.isRaider ? '' : 'text-neutral-md'}`}
                  >
                    {project.exists && project.isRaider ? (
                      <Tooltip
                        content={t('tooltips.landing.recentProject')}
                        position="top"
                        className="flex-1 min-w-0"
                      >
                        <button
                          onClick={() => openRecentProject(project)}
                          title={project.path}
                          className="w-full flex items-center justify-between gap-4 px-4 py-2 text-left hover:bg-neutral-50 transition-colors"
                        >
                          <span className="min-w-0">
                            <span className="block font-medium text-neutral-dark truncate">
                              {project.name}
                            </span>
                            <span className="block text-xs text-neutral-md truncate">
                              {project.path}
                            </span>
                          </span>
                          <span className="text-xs text-neutral-md shrink-0">
                            {t('landing.recentProjects.opened', {
                              date: new Date(project.lastOpened).toLocaleString(undefined, {
                                dateStyle: 'medium',
                                timeStyle: 'short'
                              })
                            })}
                          </span>
                        </button>
                      </Tooltip>
                    ) : (
                      <span className="flex-1 min-w-0 flex items-center justify-between gap-4 px-4 py-2">
                        <span className="min-w-0">
                          <span className="block font-medium truncate">{project.name}</span>
                          <span className="block text-xs truncate">{project.path}</span>
                        </span>
                        <span className="text-xs shrink-0">
                          {t(
                            project.exists
                              ? 'landing.recentProjects.notRaider'
                              : 'landing.recentProjects.folderNotFound'
                          )}
                        </span>
                      </span>
                    )}
                    <button
                      onClick={() => void removeRecentProject(project)}
                      aria-label={t('landing.recentProjects.removeLabel', { name: project.name })}
                      className="shrink-0 text-xs px-2 py-1 rounded border border-neutral-bdr bg-white text-neutral-dk hover:bg-neutral-50"
                    >
                      {t('landing.recentProjects.remove')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {quickProjects.length > 0 && (
            <section aria-labelledby="quick-recordings" className="w-full mb-8">
              <h2 id="quick-recordings" className="text-lg font-semibold text-neutral-dark">
                {t('landing.quickRecordings.title')}
              </h2>
              <p className="text-sm text-neutral-md mb-3">{t('landing.quickRecordings.hint')}</p>
              <ul className="border border-neutral-bdr rounded-lg bg-white shadow-card divide-y divide-neutral-bdr">
                {quickProjects.map((project) => (
                  <li key={project.path}>
                    <Tooltip
                      content={t('tooltips.landing.quickRecording')}
                      position="top"
                      className="w-full"
                    >
                      <button
                        onClick={() => openQuickProject(project)}
                        className="w-full flex items-center justify-between gap-4 px-4 py-2 text-left hover:bg-neutral-50 transition-colors"
                      >
                        <span className="font-medium text-neutral-dark truncate">
                          {project.name}
                        </span>
                        <span className="text-xs text-neutral-md shrink-0">
                          {t('landing.quickRecordings.changed', {
                            date: new Date(project.modifiedAt).toLocaleString(undefined, {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })
                          })}
                        </span>
                      </button>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        // A first launch: one primary start, the others secondary
        <div data-testid="landing" data-layout="start" className="flex flex-col items-center">
          <div className="mb-5">
            <Logo size={72} />
          </div>
          <h1 className="text-[2.25rem] font-bold text-neutral-dark mb-2">{t('landing.title')}</h1>
          <p className="text-center text-lg text-neutral-md mb-6">{t('landing.subtitle')}</p>
          <div className="mb-6">{setupLine}</div>
          {recordButton(true)}
          <p id="landing-record-hint" className="text-sm text-neutral-md mt-2 mb-6 text-center">
            {ready ? t('landing.start.recordHint') : notReadyReason}
          </p>
          <div className="flex flex-wrap justify-center gap-3 mb-6">{secondaryButtons}</div>
          {howItWorks}
        </div>
      )}

      {quickRecordOpen && <QuickRecordDialog onClose={() => setQuickRecordOpen(false)} />}

      {fixOpen === 'ruby' && (
        <RubyInstallModal
          onClose={() => {
            setFixOpen(null)
            recheck()
          }}
        />
      )}
      {fixOpen === 'gems' && (
        <RubyGemsInstallModal
          missingGems={gemsToInstall}
          onInstall={() => {
            setFixOpen(null)
            // Busy at once, so the line shows the check and Fix… cannot start a second install
            void useRubyStore.getState().installGems(gemsToInstall)
          }}
          onClose={() => {
            setFixOpen(null)
            recheck()
          }}
        />
      )}
    </div>
  )
}

export default Landing
