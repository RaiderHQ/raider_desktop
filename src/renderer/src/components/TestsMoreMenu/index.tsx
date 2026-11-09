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
  /** Starts naming a new flow; without it the menu has no New flow item */
  onNewFlow?: () => void
}

type Outcome = {
  success: boolean
  path?: string
  error?: string
  imported?: number
  skipped?: number
  failed?: number
}

const menuItem =
  'block w-full text-left px-3 py-1.5 text-xs text-neutral-dk hover:bg-neutral-50 disabled:text-neutral-mid disabled:cursor-not-allowed disabled:hover:bg-white'

/** The Tests list's "More" menu: run the tagged tests, import and export. */
const TestsMoreMenu: React.FC<TestsMoreMenuProps> = ({ tag, onNewFlow }) => {
  const { t } = useTranslation()
  const runActive = useRunStore((s) => s.isActive)
  const recorderRunning = useRecorderStore((s) => s.isRunning)
  const runBusy = runActive || recorderRunning
  // A project Raider can't record into keeps its spec files read-only: nothing is imported into it
  const cannotImportReason = useProjectStore((s) => {
    const layout = s.layout
    if (!layout || layout.recordable !== false) return undefined
    if (layout.runtimeSupported === false) return t('recorder.unsupported.gemTooOld')
    return t(`recorder.unsupported.${layout.unsupportedReason ?? 'generic'}`)
  })
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Main says whether flows/flow_helper.rb is set up; asked each time the menu opens
  const projectPath = useProjectStore((s) => s.projectPath)
  const [flowsReady, setFlowsReady] = useState(false)
  useEffect(() => {
    if (!open || !onNewFlow) return
    let current = true
    Promise.resolve()
      .then(() => window.api.flowsReady())
      .then((ready) => {
        if (current) setFlowsReady(ready === true)
      })
      .catch((error: unknown) => {
        console.error('Checking whether flows are set up failed:', error)
        if (current) setFlowsReady(false)
      })
    return (): void => {
      current = false
    }
  }, [open, projectPath, onNewFlow])

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return (): void => document.removeEventListener('mousedown', close)
  }, [])

  const report = (kind: 'import' | 'export', type: string, result: Outcome): void => {
    if (result.imported !== undefined) {
      // import-project says how many came in, were already there, or failed
      const text = t('tests.moreMenu.importSummary', {
        imported: result.imported,
        skipped: result.skipped ?? 0,
        failed: result.failed ?? 0
      })
      if (result.success) toast.success(text)
      else toast.error(text)
      return
    }
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
          {onNewFlow && (
            <>
              <button
                role="menuitem"
                className={menuItem}
                disabled={!flowsReady || cannotImportReason !== undefined}
                title={
                  cannotImportReason ??
                  (flowsReady ? t('tooltips.tests.newFlow') : t('tooltips.tests.flowsNotReady'))
                }
                onClick={() => {
                  setOpen(false)
                  onNewFlow()
                }}
              >
                {t('tests.moreMenu.newFlow')}
              </button>
              <hr className="my-1 border-neutral-bdr" />
            </>
          )}
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
            disabled={cannotImportReason !== undefined}
            title={cannotImportReason}
            onClick={() => act('import', 'Test', () => window.api.importTest())}
          >
            {t('tests.moreMenu.importTest')}
          </button>
          <button
            role="menuitem"
            className={menuItem}
            disabled={cannotImportReason !== undefined}
            title={cannotImportReason}
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
