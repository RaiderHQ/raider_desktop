import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Tooltip from '@components/Tooltip'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'

interface TestsMoreMenuProps {
  /** The tag the list is filtered by; null means all tests. */
  tag: string | null
}

type Outcome = { success: boolean; path?: string; error?: string }

const menuItem =
  'block w-full text-left px-3 py-1.5 text-xs text-neutral-dk hover:bg-neutral-50 disabled:text-neutral-mid disabled:cursor-not-allowed disabled:hover:bg-white'

/** The Tests list's "More" menu: run the tagged tests, import and export. */
const TestsMoreMenu: React.FC<TestsMoreMenuProps> = ({ tag }) => {
  const { t } = useTranslation()
  const runActive = useRunStore((s) => s.isActive || s.checking)
  const recorderRunning = useRecorderStore((s) => s.isRunning)
  const runBusy = runActive || recorderRunning
  const mobileProject = useProjectStore((s) => s.layout?.automation === 'appium')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return (): void => document.removeEventListener('mousedown', close)
  }, [])

  const report = (kind: 'import' | 'export', type: string, result: Outcome): void => {
    if (result.success) {
      toast.success(
        kind === 'import'
          ? t('recorder.mainRecorderPanel.importSuccess', { importType: type })
          : t('recorder.mainRecorderPanel.exportSuccess', { exportType: type, path: result.path })
      )
    } else {
      toast.error(
        t(
          kind === 'import'
            ? 'recorder.mainRecorderPanel.importError'
            : 'recorder.mainRecorderPanel.exportError',
          { error: result.error }
        )
      )
    }
  }

  const act = (kind: 'import' | 'export', type: string, run: () => Promise<Outcome>): void => {
    setOpen(false)
    run()
      .then(async (result) => {
        report(kind, type, result)
        if (kind === 'import' && result.success) await useTestsListStore.getState().reload()
      })
      .catch((error: unknown) => {
        console.error(`${kind} ${type} failed:`, error)
        report(kind, type, { success: false, error: String(error) })
      })
  }

  const runTagged = (): void => {
    setOpen(false)
    if (!tag) return
    // Overview's own panel shows it, above the tabs
    void useRunStore
      .getState()
      .start(
        { kind: 'tags', tags: [tag] },
        { route: '/overview', label: t('run.originTagged', { tag }) }
      )
  }

  const noTag = !tag

  return (
    <div className="relative flex items-center" ref={ref}>
      <Tooltip content={t('tooltips.tests.moreMenu')} position="bottom">
        <button
          aria-label={t('tests.moreMenu.actions')}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="inline-flex h-7 shrink-0 items-center gap-1 whitespace-nowrap text-xs px-2.5 rounded border border-neutral-bdr bg-white text-neutral-dk hover:bg-neutral-50 font-medium"
        >
          {t('tests.moreMenu.label')}
          <span aria-hidden className="text-[0.6rem] leading-none">
            ▾
          </span>
        </button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 w-40 rounded border border-neutral-bdr bg-white shadow-card py-1"
        >
          <button
            role="menuitem"
            className={menuItem}
            disabled={noTag || runBusy}
            title={noTag ? t('tooltips.tests.runTagged.noTag') : undefined}
            onClick={runTagged}
          >
            {t('tests.moreMenu.runTagged')}
          </button>
          <hr className="my-1 border-neutral-bdr" />
          <button
            role="menuitem"
            className={menuItem}
            disabled={mobileProject}
            title={mobileProject ? t('tests.mobileNoImport') : undefined}
            onClick={() => act('import', 'Test', () => window.api.importTest())}
          >
            {t('tests.moreMenu.importTest')}
          </button>
          <button
            role="menuitem"
            className={menuItem}
            onClick={() => act('import', 'Project', () => window.api.importProject())}
          >
            {t('tests.moreMenu.importProject')}
          </button>
          <button
            role="menuitem"
            className={menuItem}
            onClick={() => act('export', 'Project', () => window.api.exportProject())}
          >
            {t('tests.moreMenu.exportProject')}
          </button>
        </div>
      )}
    </div>
  )
}

export default TestsMoreMenu
