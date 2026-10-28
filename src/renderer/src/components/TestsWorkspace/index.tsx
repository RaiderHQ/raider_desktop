import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import TestsList from '@components/TestsList'
import { useTestsList } from '../../hooks/useTestsList'
import { fromRouteParam, testKeyOf, toRouteParam } from '@foundation/testKey'
import type { TestKey, TestRow } from '@foundation/testKey'

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
  const rows = useTestsList()

  const selectedKey: TestKey | null = param ? fromRouteParam(param) || null : null
  const selectedRow = rows?.find((r) => testKeyOf(r) === selectedKey) ?? null

  const select = (key: TestKey): void => navigate(`/overview/tests/${toRouteParam(key)}`)

  const pane = renderPane ? (
    renderPane(selectedRow)
  ) : selectedRow ? (
    <div className="p-6 text-sm text-neutral-dark">{selectedRow.name}</div>
  ) : (
    <div className="flex items-center justify-center h-full text-neutral-mid text-sm p-8 text-center">
      {t('tests.selectOrCreate')}
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-11rem)] min-h-[24rem] border border-neutral-bdr rounded-lg shadow-card bg-white overflow-hidden">
      <div className="w-72 shrink-0 border-r border-neutral-bdr min-h-0">
        {rows && (
          <TestsList
            rows={rows}
            selectedKey={selectedKey}
            onSelect={select}
            onNewTest={onNewTest ?? ((): void => navigate('/overview/tests'))}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 min-h-0 overflow-y-auto">{pane}</div>
    </div>
  )
}

export default TestsWorkspace
