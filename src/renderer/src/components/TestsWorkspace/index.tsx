import React, { useState } from 'react'
import { useMatch, useNavigate, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import Tooltip from '@components/Tooltip'
import TestsList from '@components/TestsList'
import TestPage from '@components/TestPage'
import CodeTestPane from '@components/CodeTestPane'
import TestsMoreMenu from '@components/TestsMoreMenu'
import TagFilter from '@components/TagFilter'
import { useTestsList } from '../../hooks/useTestsList'
import useRecorderStore from '@foundation/Stores/recorderStore'
import { fromRouteParam, testKeyOf, toRouteParam } from '@foundation/testKey'
import type { TestKey, TestRow } from '@foundation/testKey'
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
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  const selectedKey: TestKey | null = param ? fromRouteParam(param) || null : null
  // A tag nobody has any more (edited, reloaded, other project) falls back to all tests
  const activeTag = tagFilter && rows?.some((r) => r.tags.includes(tagFilter)) ? tagFilter : null
  const visibleRows = rows?.filter((r) => !activeTag || r.tags.includes(activeTag))
  const selectedRow = rows?.find((r) => testKeyOf(r) === selectedKey) ?? null

  const select = (key: TestKey): void => {
    void navigate(`/overview/tests/${toRouteParam(key)}`)
  }

  const pane = renderPane ? (
    renderPane(selectedRow)
  ) : isNewTest ? (
    // The same page as a recorded test, so it stays mounted once the new test is saved
    <TestPage targetSuiteId={UNLISTED_SUITE_ID} />
  ) : selectedRow ? (
    selectedRow.ownership === 'recorded' || selectedRow.ownership === 'legacy' ? (
      // One page for every recorded test, so its recording hooks mount once
      <TestPage row={selectedRow} />
    ) : (
      // A file of its own per pane: leaving one saves its recording, like leaving a test page
      <CodeTestPane key={testKeyOf(selectedRow)} row={selectedRow} />
    )
  ) : (
    <div className="flex items-center justify-center h-full text-neutral-md text-sm p-8 text-center">
      {t('tests.selectOrCreate')}
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[24rem] border border-neutral-bdr rounded-lg shadow-card bg-white overflow-hidden">
      {isRecording ? (
        // Recording folds the list away; going back to it leaves the test page, which saves
        <div
          data-testid="tests-rail"
          className="w-10 shrink-0 border-r border-neutral-bdr py-2 bg-neutral-50 flex justify-center"
        >
          <Tooltip content={t('tooltips.tests.rail')} position="right" className="flex">
            {/* A 40 px strip (V6): the label reads upward; the chevron stays upright, toward the list */}
            <button
              onClick={() => navigate('/overview/tests')}
              className="flex flex-col items-center gap-1 text-sm font-medium text-neutral-dark hover:text-ruby px-1.5 py-1 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ruby"
            >
              <span aria-hidden className="leading-none">
                ‹
              </span>
              <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap">
                {t('tests.rail')}
              </span>
            </button>
          </Tooltip>
        </div>
      ) : (
        <div className="w-72 shrink-0 border-r border-neutral-bdr min-h-0">
          {rows && (
            <TestsList
              rows={visibleRows ?? rows}
              headerExtra={
                <>
                  <TagFilter rows={rows} value={activeTag} onChange={setTagFilter} />
                  <TestsMoreMenu tag={activeTag} />
                </>
              }
              selectedKey={selectedKey}
              onSelect={select}
              onNewTest={
                onNewTest ??
                ((): void => {
                  void navigate('/overview/tests/new')
                })
              }
            />
          )}
        </div>
      )}
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">{pane}</div>
    </div>
  )
}

export default TestsWorkspace
