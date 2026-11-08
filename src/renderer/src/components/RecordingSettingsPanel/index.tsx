import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { FaChevronDown, FaChevronRight } from 'react-icons/fa'
import Tooltip from '@components/Tooltip'
import useProjectStore from '@foundation/Stores/projectStore'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { DEFAULT_SELECTOR_PRIORITY } from '@shared/selectorPriority'

const KEY = 'recordingSettingsCollapsed'

// Folded by default so the tests keep their room; opened once, it stays open for this user
function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0'
  } catch {
    return true
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0')
  } catch {
    // Storage is unavailable: the panel opens folded next time
  }
}

// The kinds the recorder knows; any other configured name is a test-id style attribute
const KNOWN_KINDS = new Set(['role', 'label', 'testId', 'text', 'id', 'css', 'xpath'])

interface RecordingSettingsPanelProps {
  /** The explicit wait, shared with the Files tab's field so neither writes a stale value */
  explicitWait: number
  setExplicitWait: (value: number) => void
  /** False until the project's settings load: nothing is saved before that */
  loaded: boolean
  saveWait: (patch: { explicitWait: number }) => Promise<void> | void
}

const buttonClass =
  'w-6 h-6 flex items-center justify-center rounded text-neutral-dk hover:bg-neutral-lt disabled:opacity-30 disabled:cursor-not-allowed'

/** The Tests tab's recording settings, shaped like the Files tab's test settings. */
const RecordingSettingsPanel: React.FC<RecordingSettingsPanelProps> = ({
  explicitWait,
  setExplicitWait,
  loaded,
  saveWait
}) => {
  const { t } = useTranslation()
  const projectPath = useProjectStore((s) => s.projectPath)
  // A recording reads its settings when it starts: they stay as they are until it ends
  const recording = useRecorderStore((s) => s.isRecording)
  const [collapsed, setCollapsed] = useState(loadCollapsed)
  const [priority, setPriority] = useState<string[] | null>(null)
  // What config.yml holds as far as we know: a failed save goes back to this, not to the
  // order on screen when it started (a later save may have succeeded in between)
  const saved = useRef<string[] | null>(null)
  // A save that finishes after the project changed must not touch the new project's list
  const generation = useRef(0)
  const [announcement, setAnnouncement] = useState('')
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    let cancelled = false
    generation.current += 1
    setPriority(null)
    saved.current = null
    window.api
      .getRecorderSettings()
      .then((settings) => {
        if (cancelled) return
        const list = settings?.selectorPriority
        // A name listed twice (or data-testid next to testId) shows once
        const clean = Array.isArray(list) && list.length > 0 ? [...new Set(list)] : null
        saved.current = clean
        setPriority(clean)
      })
      .catch((error: unknown) => console.error('Loading the locator order failed:', error))
    return (): void => {
      cancelled = true
    }
  }, [projectPath])

  const toggle = (): void => {
    setCollapsed((was) => {
      saveCollapsed(!was)
      return !was
    })
  }

  const savePriority = async (next: string[]): Promise<void> => {
    const mine = generation.current
    setPriority(next)
    let failure: string | null = null
    try {
      const result = await window.api.updateRecordingSettings({ selectorPriority: next })
      if (result.success) {
        if (generation.current === mine) saved.current = next
        return
      }
      failure = result.error ?? ''
    } catch (error) {
      failure = String(error)
    }
    if (generation.current !== mine) return
    setPriority(saved.current)
    toast.error(`${t('settings.recording.error.recordingUpdateFailed')} ${failure}`)
  }

  const move = (index: number, by: -1 | 1): void => {
    if (!priority) return
    const next = [...priority]
    const kind = next[index]
    ;[next[index], next[index + by]] = [next[index + by], next[index]]
    const to = index + by
    setAnnouncement(t('settings.recording.priority.moved', { kind: kindLabel(kind), position: to + 1 }))
    // Keep focus on the moved kind; at an end its button turns off, so use the other one
    const atEnd = to === 0 || to === next.length - 1
    requestAnimationFrame(() => {
      const item = listRef.current?.querySelector(`[data-kind="${CSS.escape(kind)}"]`)
      const buttons = item?.querySelectorAll('button')
      const target = buttons?.[atEnd ? (by === -1 ? 1 : 0) : by === -1 ? 0 : 1]
      ;(target as HTMLButtonElement | undefined)?.focus()
    })
    void savePriority(next)
  }

  const kindLabel = (kind: string): string =>
    KNOWN_KINDS.has(kind)
      ? t(`settings.recording.priority.kind.${kind}`)
      : t('settings.recording.priority.kind.attribute', { name: kind })

  const isDefault =
    priority !== null &&
    priority.length === DEFAULT_SELECTOR_PRIORITY.length &&
    priority.every((p, i) => p === DEFAULT_SELECTOR_PRIORITY[i])

  return (
    <div
      data-testid="recording-settings"
      className="border border-neutral-bdr rounded-lg bg-neutral-50 px-4 py-2 mb-3 space-y-2"
    >
      <Tooltip
        content={t(
          collapsed ? 'tooltips.recordingSettings.expand' : 'tooltips.recordingSettings.collapse'
        )}
        position="right"
      >
        <button
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex items-center gap-1 text-sm font-semibold text-neutral-dark hover:text-ruby transition-colors"
          data-testid="recording-settings-toggle"
        >
          {collapsed ? <FaChevronRight size={10} /> : <FaChevronDown size={10} />}
          {t('settings.recording.title')}
        </button>
      </Tooltip>
      {!collapsed && (
        <div className="flex items-start gap-8 flex-wrap pb-1">
          <Tooltip content={t('tooltips.recordingSettings.wait')} position="right">
            <div className="flex items-center gap-2">
              <label
                htmlFor="recording-explicit-wait"
                className="text-sm font-medium text-neutral-dk whitespace-nowrap"
              >
                {t('settings.recording.wait.label')}
              </label>
              <input
                type="number"
                id="recording-explicit-wait"
                value={explicitWait}
                onChange={(e) => {
                  // An emptied field is not a wait of 0
                  if (e.target.value.trim() === '') return
                  const value = Number(e.target.value)
                  if (Number.isFinite(value) && value >= 0) setExplicitWait(value)
                }}
                onBlur={() => void saveWait({ explicitWait })}
                disabled={!loaded || recording}
                min="0"
                className="border border-neutral-bdr rounded px-2 py-1 w-16 text-sm"
                data-testid="recording-explicit-wait"
              />
              <span className="text-xs text-neutral-md">{t('settings.recording.wait.unit')}</span>
            </div>
          </Tooltip>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <Tooltip content={t('tooltips.recordingSettings.priority')} position="right">
                <span id="recording-priority-label" className="text-sm font-medium text-neutral-dk">
                  {t('settings.recording.priority.label')}
                </span>
              </Tooltip>
              <button
                onClick={() => void savePriority([...DEFAULT_SELECTOR_PRIORITY])}
                disabled={!priority || isDefault || recording}
                className="text-xs text-ruby hover:underline disabled:text-neutral-md disabled:no-underline disabled:cursor-not-allowed"
                data-testid="recording-priority-reset"
              >
                {t('settings.recording.priority.reset')}
              </button>
            </div>
            {priority && (
              <ol
                ref={listRef}
                aria-labelledby="recording-priority-label"
                data-testid="recording-priority-list"
                className="flex flex-wrap items-center gap-1"
              >
                {priority.map((kind, index) => (
                  <li
                    key={kind}
                    data-kind={kind}
                    className="flex items-center gap-0.5 pl-2 pr-0.5 py-0.5 rounded border border-neutral-bdr bg-white text-xs text-neutral-dark"
                  >
                    <span className="text-neutral-md mr-1">{index + 1}.</span>
                    {kindLabel(kind)}
                    <button
                      aria-label={`${t('settings.recording.priority.up')} ${kindLabel(kind)}`}
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || recording}
                      className={buttonClass}
                    >
                      ‹
                    </button>
                    <button
                      aria-label={`${t('settings.recording.priority.down')} ${kindLabel(kind)}`}
                      onClick={() => move(index, 1)}
                      disabled={index === priority.length - 1 || recording}
                      className={buttonClass}
                    >
                      ›
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <span className="sr-only" aria-live="polite">
              {announcement}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default RecordingSettingsPanel
