import React, { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRubyStore from '@foundation/Stores/rubyStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { UNLISTED_SUITE_ID } from '@shared/types/suite'
import { MOBILE_NO_LEGACY } from '@shared/types/prepareRun'

interface SuiteFilterProps {
  /** The suite whose tests are listed; null means all tests. */
  value: string | null
  onChange: (id: string | null) => void
}

type Outcome = { success: boolean; path?: string; error?: string }

const menuItem =
  'block w-full text-left px-3 py-1.5 text-xs text-neutral-dk hover:bg-neutral-50 disabled:text-neutral-mid disabled:cursor-not-allowed disabled:hover:bg-white'

/** Picks which suite the Tests list shows, and holds the suite-level actions. */
const SuiteFilter: React.FC<SuiteFilterProps> = ({ value, onChange }) => {
  const { t } = useTranslation()
  const suites = useRecorderStore((s) => s.suites)
  const runActive = useRunStore((s) => s.isActive || s.checking)
  const recorderRunning = useRecorderStore((s) => s.isRunning)
  const runBusy = runActive || recorderRunning
  // Suites can't run in a mobile project yet
  const mobileProject = useProjectStore((s) => s.layout?.automation === 'appium')
  const mobileNoteId = useId()
  const mobileImportNoteId = useId()
  const [open, setOpen] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const close = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return (): void => document.removeEventListener('mousedown', close)
  }, [])

  const suite = suites.find((s) => s.id === value)
  const reload = (): Promise<void> => useTestsListStore.getState().reload()

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
        if (kind === 'import' && result.success) await reload()
      })
      .catch((error: unknown) => {
        console.error(`${kind} ${type} failed:`, error)
        report(kind, type, { success: false, error: String(error) })
      })
  }

  const runSuite = async (): Promise<void> => {
    setOpen(false)
    const cmd = useRubyStore.getState().rubyCommand
    const path = useProjectStore.getState().projectPath
    if (!suite || useProjectStore.getState().layout?.automation === 'appium') return
    if (!cmd) {
      toast.error(t('recorder.noRuby'))
      return
    }
    let prepared: Awaited<ReturnType<typeof window.api.prepareSuiteRun>>
    try {
      prepared = await window.api.prepareSuiteRun(suite.id)
    } catch (error) {
      console.error('Preparing the suite run failed:', error)
      toast.error(error instanceof Error ? error.message : String(error))
      return
    }
    if ('error' in prepared) {
      toast.error(prepared.error)
      return
    }
    if (prepared.mode === 'files') {
      if (prepared.skipped.length > 0) {
        toast(t('run.skippedMissing', { count: prepared.skipped.length }), { icon: '⚠️' })
      }
      // Overview's own panel shows it, above the tabs
      void useRunStore
        .getState()
        .start({ kind: 'files', files: prepared.files }, { route: '/overview', label: suite.name })
      return
    }
    // Projects still on the old suite format run a temporary copy of the suite
    const { setIsRunning, setIsOutputVisible } = useRecorderStore.getState()
    const { setRunOutput, setRunResult } = useRunOutputStore.getState()
    setIsRunning(true)
    setRunOutput(`Running suite: ${suite.name}...`)
    try {
      const result = await window.api.runSuite(suite.id, path || '', cmd)
      // Main found the project is mobile before this page knew
      if (result.code === MOBILE_NO_LEGACY) {
        setRunResult(t('run.mobile.noLegacy'), false)
        setIsOutputVisible(true)
        toast.error(t('run.mobile.noLegacy'))
        return
      }
      setRunResult(result.output, result.success)
      setIsOutputVisible(true)
      if (result.success) toast.success(t('tests.suiteFilter.runPassed', { suite: suite.name }))
      else toast.error(t('tests.suiteFilter.runFailed', { suite: suite.name }))
    } catch (error) {
      console.error('Running the suite failed:', error)
      setRunResult(String(error), false)
      setIsOutputVisible(true)
      toast.error(t('tests.suiteFilter.runFailed', { suite: suite.name }))
    } finally {
      setIsRunning(false)
    }
  }

  const createSuite = async (): Promise<void> => {
    const suiteName = name.trim()
    if (!suiteName || suites.some((s) => s.name === suiteName)) return
    setNaming(false)
    setName('')
    try {
      const result = await window.api.createSuite(suiteName)
      if (result.success) {
        await reload()
        if (result.suite) onChange(result.suite.id)
      } else {
        toast.error(t('recorder.mainRecorderPanel.importError', { error: result.error }))
      }
    } catch (error) {
      console.error('Creating the suite failed:', error)
    }
  }

  const deleteSuite = async (): Promise<void> => {
    setOpen(false)
    if (!suite || suite.id === UNLISTED_SUITE_ID) return
    if (!window.confirm(t('recorder.testSuitePanel.deleteConfirmation', { suiteName: suite.name })))
      return
    try {
      await window.api.deleteSuite(suite.id)
      onChange(null)
      await reload()
    } catch (error) {
      console.error('Deleting the suite failed:', error)
    }
  }

  return (
    <div className="relative flex items-center gap-1" ref={ref}>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={t('tests.suiteFilter.label')}
        className="max-w-[7rem] border border-neutral-bdr rounded px-1.5 py-1 text-xs bg-white"
      >
        <option value="">{t('tests.suiteFilter.all')}</option>
        {suites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        aria-label={t('tests.suiteFilter.actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-xs px-2 py-1 rounded border border-neutral-bdr bg-white hover:bg-neutral-50"
      >
        <span aria-hidden>⋯</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-20 w-40 rounded border border-neutral-bdr bg-white shadow-card py-1"
        >
          <button
            role="menuitem"
            className={menuItem}
            disabled={!suite || runBusy || mobileProject}
            aria-describedby={mobileProject ? mobileNoteId : undefined}
            onClick={runSuite}
          >
            {t('tests.suiteFilter.run')}
          </button>
          {mobileProject && (
            <p id={mobileNoteId} className="px-3 pb-1.5 text-xs text-neutral-mid">
              {t('suites.mobileUnavailable')}
            </p>
          )}
          <button
            role="menuitem"
            className={menuItem}
            onClick={() => {
              setOpen(false)
              setNaming(true)
            }}
          >
            {t('tests.suiteFilter.new')}
          </button>
          {suite && suite.id !== UNLISTED_SUITE_ID && (
            <button role="menuitem" className={menuItem} onClick={deleteSuite}>
              {t('tests.suiteFilter.delete')}
            </button>
          )}
          <hr className="my-1 border-neutral-bdr" />
          <button
            role="menuitem"
            className={menuItem}
            disabled={mobileProject}
            title={mobileProject ? t('tests.mobileNoImport') : undefined}
            aria-describedby={mobileProject ? mobileImportNoteId : undefined}
            onClick={() =>
              act('import', 'Test', () => window.api.importTest(value ?? UNLISTED_SUITE_ID))
            }
          >
            {t('tests.suiteFilter.importTest')}
          </button>
          <button
            role="menuitem"
            className={menuItem}
            disabled={mobileProject}
            title={mobileProject ? t('tests.mobileNoImport') : undefined}
            aria-describedby={mobileProject ? mobileImportNoteId : undefined}
            onClick={() => act('import', 'Suite', () => window.api.importSuite())}
          >
            {t('tests.suiteFilter.importSuite')}
          </button>
          {mobileProject && (
            <p id={mobileImportNoteId} className="px-3 pb-1.5 text-xs text-neutral-mid">
              {t('tests.mobileNoImport')}
            </p>
          )}
          <button
            role="menuitem"
            className={menuItem}
            onClick={() => act('import', 'Project', () => window.api.importProject())}
          >
            {t('tests.suiteFilter.importProject')}
          </button>
          <button
            role="menuitem"
            className={menuItem}
            disabled={!suite}
            onClick={() => act('export', 'Suite', () => window.api.exportSuite(value as string))}
          >
            {t('tests.suiteFilter.exportSuite')}
          </button>
          <button
            role="menuitem"
            className={menuItem}
            onClick={() => act('export', 'Project', () => window.api.exportProject())}
          >
            {t('tests.suiteFilter.exportProject')}
          </button>
        </div>
      )}
      {naming && (
        <div className="absolute right-0 top-full mt-1 z-20 flex items-center gap-1 rounded border border-neutral-bdr bg-white shadow-card p-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') createSuite()
              if (e.key === 'Escape') setNaming(false)
            }}
            placeholder={t('recorder.testSuitePanel.newSuiteName')}
            aria-label={t('tests.suiteFilter.new')}
            className="w-36 border border-neutral-bdr rounded px-2 py-1 text-xs"
          />
          <button onClick={createSuite} className="text-xs px-2 py-1 rounded bg-ruby text-white">
            {t('recorder.testSuitePanel.create')}
          </button>
        </div>
      )}
    </div>
  )
}

export default SuiteFilter
