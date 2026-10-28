import React, { useEffect, useState } from 'react'
import { useMatch, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import TestsList from '@components/TestsList'
import TestPage from '@components/TestPage'
import SuiteFilter from '@components/SuiteFilter'
import { useTestsList } from '../../hooks/useTestsList'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { fromRouteParam, testKeyOf, toRouteParam } from '@foundation/testKey'
import type { TestKey, TestRow } from '@foundation/testKey'
import type { Suite } from '@foundation/Types/suite'
import { UNLISTED_SUITE_ID } from '@shared/types/suite'

interface TestsWorkspaceProps {
  /** The right-hand pane for the selected test (null: nothing selected). */
  renderPane?: (row: TestRow | null) => React.ReactNode
  onNewTest?: () => void
}

/** The Tests tab: the list on the left, the routed selection on the right. */
const TestsWorkspace: React.FC<TestsWorkspaceProps> = ({ renderPane, onNewTest }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { testKey: param } = useParams()
  const isNewTest = useMatch('/overview/tests/new') !== null
  const rows = useTestsList()
  const isRecording = useRecorderStore((s) => s.isRecording)
  // null: all tests. A new test joins the filtered suite, or sits outside any suite
  const [suiteFilter, setSuiteFilter] = useState<string | null>(null)

  // The suite menu needs the suites even before a test page (which syncs them) is open
  useEffect(() => {
    const { setSuites } = useRecorderStore.getState()
    window.api
      .getSuites()
      .then(setSuites)
      .catch((error: unknown) => console.error('Loading the suites failed:', error))
    const off = window.electron?.ipcRenderer?.on('suite-updated', (_event, updated: Suite[]) =>
      setSuites(updated)
    )
    return (): void => off?.()
  }, [])

  const selectedKey: TestKey | null = param ? fromRouteParam(param) || null : null
  const visibleRows = suiteFilter ? rows?.filter((r) => r.suiteIds.includes(suiteFilter)) : rows
  const selectedRow = rows?.find((r) => testKeyOf(r) === selectedKey) ?? null

  const select = (key: TestKey): void => navigate(`/overview/tests/${toRouteParam(key)}`)

  const pane = renderPane ? (
    renderPane(selectedRow)
  ) : isNewTest ? (
    // The same page as a recorded test, so it stays mounted once the new test is saved
    <TestPage targetSuiteId={suiteFilter ?? UNLISTED_SUITE_ID} />
  ) : selectedRow ? (
    selectedRow.ownership === 'recorded' || selectedRow.ownership === 'legacy' ? (
      // One page for every recorded test, so its recording hooks mount once
      <TestPage row={selectedRow} />
    ) : (
      <div className="p-6 space-y-2 text-sm">
        <p className="font-semibold text-neutral-dark">{selectedRow.name}</p>
        <p className="text-neutral-mid">{t('testPage.codePlaceholder')}</p>
      </div>
    )
  ) : (
    <div className="flex items-center justify-center h-full text-neutral-mid text-sm p-8 text-center">
      {t('tests.selectOrCreate')}
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[24rem] border border-neutral-bdr rounded-lg shadow-card bg-white overflow-hidden">
      {isRecording ? (
        // Recording folds the list away; going back to it leaves the test page, which saves
        <div
          data-testid="tests-rail"
          className="w-24 shrink-0 border-r border-neutral-bdr p-2 bg-neutral-50"
        >
          <button
            onClick={() => navigate('/overview/tests')}
            className="w-full text-left text-sm font-medium text-neutral-dark hover:text-ruby px-2 py-1 rounded transition-colors"
          >
            {t('tests.rail')} <span aria-hidden>›</span>
          </button>
        </div>
      ) : (
        <div className="w-72 shrink-0 border-r border-neutral-bdr min-h-0">
          {rows && (
            <TestsList
              rows={visibleRows ?? rows}
              headerExtra={<SuiteFilter value={suiteFilter} onChange={setSuiteFilter} />}
              selectedKey={selectedKey}
              onSelect={select}
              onNewTest={onNewTest ?? ((): void => navigate('/overview/tests/new'))}
            />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">{pane}</div>
    </div>
  )
}

export default TestsWorkspace
