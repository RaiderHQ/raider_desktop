import React from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { fileStatus } from '@foundation/run/runModel'
import { testKeyOf } from '@foundation/testKey'
import type { TestKey, TestRow } from '@foundation/testKey'

interface TestsListProps {
  rows: TestRow[]
  selectedKey: TestKey | null
  onSelect: (key: TestKey) => void
  onNewTest: () => void
  headerExtra?: React.ReactNode
}

// The run panel's state labels and colours, for each file's status in the last run
const statusPill = {
  running: { label: 'run.state.started', className: 'bg-neutral-lt text-neutral-dk' },
  passed: { label: 'run.state.passed', className: 'bg-status-ok-bg text-status-ok' },
  failed: { label: 'run.state.failed', className: 'bg-status-err-bg text-status-err' }
} as const

const rowButton =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr text-neutral-dk bg-white hover:bg-neutral-50 transition-colors font-medium'

const TestsList: React.FC<TestsListProps> = ({
  rows,
  selectedKey,
  onSelect,
  onNewTest,
  headerExtra
}) => {
  const { t } = useTranslation()
  const layout = useProjectStore((s) => s.layout)
  const projectPath = useProjectStore((s) => s.projectPath)
  // Only a run of this project says anything about its files
  const run = useRunStore((s) => (s.run && s.run.projectPath === projectPath ? s.run : null))

  const restore = async (row: TestRow): Promise<void> => {
    const fail = (error: unknown): void => {
      console.error('Restoring the test failed:', error)
      toast.error(t('tests.restoreFailed'))
    }
    try {
      const suites = await window.api.getSuites()
      const suite = suites.find((s) => s.tests.some((x) => x.id === row.testId))
      const test = suite?.tests.find((x) => x.id === row.testId)
      if (!suite || !test) return fail(`No suite lists test ${row.testId}`)
      const result = await window.api.saveRecording(suite.id, test)
      if (!result.success) return fail(result.error)
      toast.success(t('tests.restored'))
      await useTestsListStore.getState().reload()
    } catch (error) {
      fail(error)
    }
  }

  // "Record one" only where recording is possible; Cucumber tests aren't listed here yet
  const emptyKey =
    layout?.framework === 'cucumber'
      ? 'tests.cucumber'
      : layout && !layout.recordable
        ? 'tests.emptyNoRecording'
        : 'tests.empty'

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 p-3 border-b border-neutral-bdr">
        <button className={`${rowButton} flex-1`} onClick={onNewTest}>
          {t('tests.newTest')}
        </button>
        {headerExtra}
      </div>
      {rows.length === 0 ? (
        <div className="flex items-center justify-center flex-1 text-neutral-mid text-sm p-6 text-center">
          {t(emptyKey)}
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-neutral-bdr">
          {rows.map((row) => {
            const key = testKeyOf(row)
            const selected = key === selectedKey
            const editedInCode = row.ownership === 'code' || row.ownership === 'codeOwnedWasRecorded'
            const status = row.file ? fileStatus(run, row.file) : null
            return (
              <li
                key={key}
                role="button"
                tabIndex={0}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onSelect(key)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(key)
                  }
                }}
                className={`flex items-center gap-2 py-2.5 px-3 cursor-pointer text-sm hover:bg-neutral-50 ${
                  selected ? 'bg-neutral-lt' : ''
                }`}
              >
                <span className="flex-1 min-w-0 truncate text-neutral-dark">{row.name}</span>
                {editedInCode && !row.missingFile && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-lt text-neutral-dk font-medium whitespace-nowrap">
                    {t('tests.editedInCode')}
                  </span>
                )}
                {row.missingFile && (
                  <>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-status-err-bg text-red-600 font-medium">
                      {t('tests.fileMissing')}
                    </span>
                    <button
                      className={rowButton}
                      onClick={(e) => {
                        e.stopPropagation()
                        restore(row)
                      }}
                    >
                      {t('tests.restore')}
                    </button>
                  </>
                )}
                <span data-testid="row-status">
                  {status && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusPill[status].className}`}
                    >
                      {t(statusPill[status].label)}
                    </span>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default TestsList
