import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import toast from 'react-hot-toast'
import Tooltip from '@components/Tooltip'
import useProjectStore from '@foundation/Stores/projectStore'
import { anyEditorDirty, recorderBusy } from '@foundation/switchGuards'

const menuItem =
  'block w-full text-left px-3 py-1.5 text-xs text-neutral-dk hover:bg-neutral-50 whitespace-nowrap'

/**
 * The open project's name as a menu at the left of the Overview tabs: the way back to the
 * start screen to switch projects, or straight to a new one. Unlike the File menu commands,
 * which stand down silently, this control says why it did nothing (U7).
 */
const ProjectMenu: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const projectPath = useProjectStore((s) => s.projectPath)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return (): void => document.removeEventListener('mousedown', close)
  }, [open])

  const name = projectPath?.split(/[\\/]/).filter(Boolean).pop() ?? ''

  const go = (route: string): void => {
    setOpen(false)
    if (recorderBusy()) {
      toast.error(t('quickRecord.stopFirst'))
      return
    }
    if (anyEditorDirty()) {
      toast.error(t('overview.projectMenu.unsaved'))
      return
    }
    void navigate(route)
  }

  return (
    <div
      className="relative mr-3"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false)
      }}
    >
      <Tooltip content={t('tooltips.overview.projectMenu')} position="bottom">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          data-testid="project-menu"
          className="inline-flex h-7 max-w-[14rem] items-center gap-1.5 px-2.5 text-xs font-medium text-neutral-dk border border-neutral-bdr rounded bg-white hover:bg-neutral-50 transition-colors"
        >
          <span className="truncate">{name}</span>
          <span aria-hidden className="text-[0.6rem] leading-none">
            ▾
          </span>
        </button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-20 min-w-[10rem] rounded border border-neutral-bdr bg-white shadow-card py-1"
        >
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
