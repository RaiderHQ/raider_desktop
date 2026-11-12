import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { FaChevronDown, FaChevronRight } from 'react-icons/fa'
import DocsLink from '@components/DocsLink'
import Tooltip from '@components/Tooltip'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useTickedTestsStore } from '@foundation/Stores/tickedTestsStore'
import type {
  GemCliError,
  GemSchedule,
  GemScheduleRule,
  ScheduleChangeResult,
  ScheduleSelection,
  SchedulesStatus
} from '@shared/types/schedules'
import ScheduleModal from './ScheduleModal'
import ScheduleRow from './ScheduleRow'
import {
  missingFileOf,
  nextRunShort,
  requestFromRule,
  scheduleErrorText,
  soonestNextRun
} from './scheduleText'

// Per project: whether the panel is open, and the gem's one-time 4.1 cleanup notice
const openKey = (project: string): string => `schedulesPanelOpen:${project}`
const noticeKey = (project: string): string => `schedulesNotice:${project}`

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // Storage is unavailable: the panel falls back to its defaults next time
  }
}

const isError = (value: unknown): value is GemCliError =>
  typeof value === 'object' && value !== null && 'error' in value

type Load =
  | { state: 'loading' }
  | { state: 'unsupported'; oldSchedules: boolean }
  | { state: 'error'; message: string }
  | { state: 'ready'; schedules: GemSchedule[] }

interface DialogState {
  editing: GemScheduleRule | null
  files: string[]
  dropped: number
  initialKind: ScheduleSelection['kind']
}

interface SchedulesPanelProps {
  /** Ticked files sent from the Tests list's Schedule…; the panel opens the dialog with them */
  pendingFiles?: string[] | null
  onPendingTaken?: () => void
  /** Told whether this project can schedule (ruby_raider 4.2+) once that is known */
  onSupportedChange?: (supported: boolean) => void
}

/** The Tests tab's Schedules: the project's schedules, their last runs, and Schedule…. */
const SchedulesPanel: React.FC<SchedulesPanelProps> = ({
  pendingFiles = null,
  onPendingTaken,
  onSupportedChange
}) => {
  const { t } = useTranslation()
  const projectPath = useProjectStore((s) => s.projectPath)
  const rubyCommand = useRubyStore((s) => s.rubyCommand)
  const runActive = useRunStore((s) => s.isActive)
  const testRows = useTestsListStore((s) => s.rows)
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [platform, setPlatform] = useState('')
  const [storedOpen, setStoredOpen] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const generation = useRef(0)
  // Kept in a ref so a new callback each render doesn't reload the list
  const supportedChanged = useRef(onSupportedChange)
  supportedChanged.current = onSupportedChange
  // The same for t: reading the list again only follows the project and Ruby
  const tRef = useRef(t)
  tRef.current = t

  useEffect(() => {
    setStoredOpen(projectPath ? readStored(openKey(projectPath)) : null)
    setNotice(projectPath ? readStored(noticeKey(projectPath)) : null)
  }, [projectPath])

  // A notice comes from one call only, so it is kept until Dismiss
  const keepNotice = useCallback(
    (text: string | null): void => {
      if (!text || !projectPath) return
      writeStored(noticeKey(projectPath), text)
      setNotice(text)
    },
    [projectPath]
  )

  /** Reads the status and the list again (Task 5's watcher calls this too). */
  const reload = useCallback(async (): Promise<void> => {
    const mine = ++generation.current
    const t = tRef.current
    const current = (): boolean => mine === generation.current
    try {
      const status = (await window.api.schedulesStatus()) as SchedulesStatus | GemCliError
      if (!current()) return
      if (isError(status)) {
        setLoad({ state: 'error', message: scheduleErrorText(t, status) })
        return
      }
      setPlatform(status.platform)
      supportedChanged.current?.(status.supported)
      if (!status.supported) {
        setLoad({ state: 'unsupported', oldSchedules: status.oldSchedules })
        return
      }
      if (!rubyCommand) {
        setLoad({ state: 'error', message: t('schedules.noRuby') })
        return
      }
      const list = await window.api.listSchedules(rubyCommand)
      if (!current()) return
      if (isError(list)) {
        setLoad({ state: 'error', message: scheduleErrorText(t, list) })
        return
      }
      keepNotice(list.notice)
      setLoad({ state: 'ready', schedules: list.schedules })
    } catch (e) {
      if (current())
        setLoad({ state: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [rubyCommand, keepNotice])

  useEffect(() => {
    // Until this project's status is known, the Tests list offers no Schedule…
    supportedChanged.current?.(false)
  }, [projectPath])

  useEffect(() => {
    setLoad({ state: 'loading' })
    void reload()
  }, [projectPath, reload])

  const schedules = load.state === 'ready' ? load.schedules : []
  const supported = load.state === 'ready'
  // Nothing stored: open when there is something to read (schedules, or why there can't be)
  const open =
    storedOpen !== null
      ? storedOpen === '1'
      : schedules.length > 0 || load.state === 'unsupported' || load.state === 'error'
  const takenNames = schedules.map((s) => s.name)
  const tags = useMemo(
    () => [...new Set((testRows ?? []).flatMap((r) => r.tags ?? []))].sort(),
    [testRows]
  )

  const setOpen = (next: boolean): void => {
    if (projectPath) writeStored(openKey(projectPath), next ? '1' : '0')
    setStoredOpen(next ? '1' : '0')
  }

  const openDialog = (state: DialogState): void => {
    setOpen(true)
    setDialog(state)
  }

  // The Tests list's Schedule… hands its ticked files over
  useEffect(() => {
    // Kept until the status is known
    if (!pendingFiles || load.state === 'loading') return
    onPendingTaken?.()
    if (!supported) {
      toast.error(load.state === 'error' ? load.message : t('schedules.errors.needs42'))
      return
    }
    openDialog({ editing: null, files: pendingFiles, dropped: 0, initialKind: 'files' })
  }, [pendingFiles, load.state])

  const projectTicked = (): string[] =>
    projectPath ? useTickedTestsStore.getState().ticked(projectPath) : []

  const editDialog = (rule: GemScheduleRule): void => {
    let files: string[] = []
    let dropped = 0
    if (rule.selection.kind === 'files') {
      // Main only takes files the Tests list has; the gem names just the first missing one
      const listed = testRows ? new Set(testRows.flatMap((r) => (r.file ? [r.file] : []))) : null
      const missing = missingFileOf(rule.osState)
      files = rule.selection.files.filter((f) => (listed ? listed.has(f) : f !== missing))
      dropped = rule.selection.files.length - files.length
    }
    openDialog({ editing: rule, files, dropped, initialKind: rule.selection.kind })
  }

  const ruby = (): string | null => {
    const command = useRubyStore.getState().rubyCommand
    if (!command) toast.error(t('schedules.noRuby'))
    return command
  }

  const stop = async (name: string): Promise<void> => {
    const command = ruby()
    if (!command) return
    const result = await window.api.removeSchedule(command, name)
    if (isError(result)) {
      toast.error(scheduleErrorText(t, result))
      return
    }
    keepNotice(result.notice)
    toast.success(t('schedules.row.stopped', { name }))
    void reload()
  }

  const reschedule = async (rule: GemScheduleRule): Promise<void> => {
    const command = ruby()
    if (!command) return
    const result = await window.api.addSchedule(command, requestFromRule(rule, platform))
    if (isError(result)) {
      toast.error(scheduleErrorText(t, result))
      return
    }
    keepNotice(result.notice)
    toast.success(t('schedules.scheduleModal.saved', { name: rule.name }))
    void reload()
  }

  const viewReport = async (name: string): Promise<void> => {
    const result = await window.api.openScheduleReport(name)
    if (isError(result)) toast.error(scheduleErrorText(t, result))
  }

  const dismissNotice = (): void => {
    if (projectPath) writeStored(noticeKey(projectPath), null)
    setNotice(null)
  }

  const next = nextRunShort(soonestNextRun(schedules))
  const now = new Date()

  return (
    <div
      data-testid="schedules-panel"
      className="border border-neutral-bdr rounded-lg bg-neutral-50 px-4 py-2 mb-3 space-y-2"
    >
      {notice && (
        <div
          role="status"
          data-testid="schedules-notice"
          className="flex items-center gap-2 text-xs rounded px-2 py-1 bg-amber-50 text-amber-800"
        >
          <span className="flex-1 min-w-0 break-words">{notice}</span>
          <Tooltip content={t('tooltips.schedules.dismiss')} position="left">
            <button
              type="button"
              onClick={dismissNotice}
              className="text-xs px-2 py-0.5 rounded border border-amber-200 bg-white hover:bg-amber-100"
            >
              {t('schedules.panel.dismiss')}
            </button>
          </Tooltip>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Tooltip content={t('tooltips.schedules.panelToggle')} position="right">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="flex items-center gap-1 text-sm font-semibold text-neutral-dark hover:text-ruby transition-colors"
            data-testid="schedules-toggle"
          >
            {open ? <FaChevronDown size={10} /> : <FaChevronRight size={10} />}
            {schedules.length > 0
              ? t('schedules.panel.titleCount', { count: schedules.length })
              : t('schedules.panel.title')}
          </button>
        </Tooltip>
        {next && (
          <span className="text-sm text-neutral-md">
            · {t('schedules.panel.nextSummary', { when: next })}
          </span>
        )}
        <span className="flex-1" />
        {supported && (
          <Tooltip content={t('tooltips.schedules.schedule')} position="left">
            <button
              type="button"
              onClick={() =>
                openDialog({
                  editing: null,
                  files: projectTicked(),
                  dropped: 0,
                  initialKind: 'all'
                })
              }
              className="text-xs px-2.5 py-1 rounded border border-ruby bg-ruby text-white font-medium hover:bg-ruby-dk"
            >
              {t('schedules.panel.schedule')}
            </button>
          </Tooltip>
        )}
        <Tooltip
          content={t('docs.learnMoreAbout', { topic: t('docs.topics.scheduling') })}
          position="left"
        >
          <DocsLink id="docs.scheduling" topic={t('docs.topics.scheduling')} size="xs" />
        </Tooltip>
      </div>
      {open && (
        <div className="pb-1" data-testid="schedules-body">
          {load.state === 'loading' && (
            <p className="text-sm text-neutral-md">{t('schedules.panel.loading')}</p>
          )}
          {load.state === 'error' && (
            <p role="alert" className="text-sm text-status-err">
              {load.message}
            </p>
          )}
          {load.state === 'unsupported' && (
            <div className="text-sm text-neutral-dk space-y-1">
              <p>{t('schedules.panel.needsUpdate')}</p>
              <p className="text-neutral-md">{t('schedules.panel.updateHint')}</p>
              {load.oldSchedules && <p>{t('schedules.panel.oldSchedules')}</p>}
            </div>
          )}
          {load.state === 'ready' && schedules.length === 0 && (
            <p className="text-sm text-neutral-md">{t('schedules.panel.empty')}</p>
          )}
          {schedules.length > 0 && (
            <ul>
              {schedules.map((s) => (
                <ScheduleRow
                  key={s.name}
                  schedule={s}
                  now={now}
                  runActive={runActive}
                  onViewReport={() => void viewReport(s.name)}
                  onRunNow={() =>
                    void useRunStore
                      .getState()
                      .startSchedule(s.name, { route: '/overview/tests', label: s.name })
                  }
                  onEdit={() => {
                    if (!s.orphan) editDialog(s)
                  }}
                  onStop={() => void stop(s.name)}
                  onReschedule={() => {
                    if (!s.orphan) void reschedule(s)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      )}
      {dialog && (
        <ScheduleModal
          editing={dialog.editing}
          files={dialog.files}
          dropped={dialog.dropped}
          initialKind={dialog.initialKind}
          tags={tags}
          takenNames={takenNames}
          platform={platform}
          onClose={() => setDialog(null)}
          onSaved={(results: ScheduleChangeResult[]) => {
            results.forEach((r) => keepNotice(r.notice))
            void reload()
          }}
          save={(command, request) => window.api.addSchedule(command, request)}
          remove={(command, name) => window.api.removeSchedule(command, name)}
        />
      )}
    </div>
  )
}

export default SchedulesPanel
