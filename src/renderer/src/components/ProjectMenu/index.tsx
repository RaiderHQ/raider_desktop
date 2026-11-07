import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import Icon from '@components/Icon'
import Tooltip from '@components/Tooltip'
import useProjectStore from '@foundation/Stores/projectStore'
import { anyEditorDirty, recorderBusy } from '@foundation/switchGuards'
import type { RecentProjectEntry } from '@shared/types/recentProject'

/** How many recent projects the menu lists above Switch project… */
const RECENT_LIMIT = 3

const menuItem =
  'block w-full text-left px-3 py-1.5 text-xs text-neutral-dk hover:bg-neutral-50 whitespace-nowrap'

/**
 * The open project's name as a menu at the left of the Overview tabs: the last few projects
 * opened on this computer, the way back to the start screen to switch projects, or straight
 * to a new one. Unlike the File menu commands, which stand down silently, this control says
 * why it did nothing (U7, V3).
 */
const ProjectMenu: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const projectPath = useProjectStore((s) => s.projectPath)
  const setProjectPath = useProjectStore((s) => s.setProjectPath)
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<RecentProjectEntry[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  // Read when the menu opens, not on every render: main stats each folder on the way
  useEffect(() => {
    if (!open) return
    let current = true
    Promise.resolve(window.api.listRecentProjects())
      .then((entries) => {
        if (!current) return
        setRecent(
          (entries ?? [])
            .filter((e) => e.exists && e.isRaider && e.path !== projectPath)
            .slice(0, RECENT_LIMIT)
        )
      })
      .catch((error: unknown) => {
        console.error('Listing the recent projects failed:', error)
        if (current) setRecent([])
      })
    return (): void => {
      current = false
    }
  }, [open, projectPath])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return (): void => document.removeEventListener('mousedown', close)
  }, [open])

  // A root folder has no name of its own
  const name =
    projectPath?.split(/[\\/]/).filter(Boolean).pop() ?? t('overview.projectMenu.project')

  // Closing from the keyboard or an item: focus goes back to the trigger, not to the body
  const close = (): void => {
    setOpen(false)
    trigger.current?.focus()
  }

  // The same guards as File › Open project; false means it said why and stayed
  const mayLeave = (): boolean => {
    close()
    if (recorderBusy()) {
      toast.error(t('quickRecord.stopFirst'))
      return false
    }
    if (anyEditorDirty()) {
      toast.error(t('overview.projectMenu.unsaved'))
      return false
    }
    return true
  }

  const go = (route: string): void => {
    if (mayLeave()) void navigate(route)
  }

  // A remembered folder opens with no folder dialog, as it does from the landing page
  const openRecent = (entry: RecentProjectEntry): void => {
    if (!mayLeave()) return
    setProjectPath(entry.path)
    void navigate('/overview')
  }

  return (
    <div
      className="relative mr-2 pr-2 border-r border-neutral-bdr"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) close()
      }}
    >
      <Tooltip
        content={t('tooltips.overview.projectMenu')}
        detail={projectPath ?? undefined}
        position="bottom"
      >
        {/* The same height, size and weight as the tab labels beside it (V1) */}
        <button
          ref={trigger}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          data-testid="project-menu"
          className="inline-flex max-w-[16rem] items-center gap-1.5 px-3 py-2 text-sm font-semibold text-neutral-dark rounded hover:bg-neutral-50 transition-colors"
        >
          <Icon name="folder" size={16} color="currentColor" className="shrink-0 text-neutral-md" />
          <span className="truncate">{name}</span>
          <Icon name="chevron-down" size={16} color="currentColor" className="shrink-0" />
        </button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-20 min-w-[10rem] max-w-[20rem] rounded border border-neutral-bdr bg-white shadow-card py-1"
        >
          {recent.map((entry) => (
            <button
              key={entry.path}
              role="menuitem"
              className={`${menuItem} flex flex-col items-start`}
              onClick={() => openRecent(entry)}
            >
              <span className="truncate max-w-full">{entry.name}</span>
              <span className="truncate max-w-full text-[0.65rem] text-neutral-md">
                {entry.path}
              </span>
            </button>
          ))}
          {recent.length > 0 && (
            <div role="separator" className="my-1 border-t border-neutral-bdr" />
          )}
          <button role="menuitem" className={menuItem} onClick={() => go('/start-project')}>
            {t('overview.projectMenu.switch')}
          </button>
          <button role="menuitem" className={menuItem} onClick={() => go('/new')}>
            {t('overview.projectMenu.new')}
          </button>
        </div>
      )}
    </div>
  )
}

export default ProjectMenu
