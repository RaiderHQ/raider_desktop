import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Tooltip from '@components/Tooltip'
import DocsLink from '@components/DocsLink'
import ContextMenu from '@components/ContextMenu'
import ConfirmationModal from '@components/ConfirmationModal'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { fileStatus } from '@foundation/run/runModel'
import { activeProjectPath } from '@foundation/activeProject'
import { useTestClipboardStore } from '@foundation/Stores/testClipboardStore'
import { onMenuCommand } from '@foundation/menuCommands'
import { copyTest, duplicateTest, pasteTest, trashTestRow } from '@foundation/testFileActions'
import { testKeyOf } from '@foundation/testKey'
import type { TestKey, TestRow } from '@foundation/testKey'

interface TestsListProps {
  rows: TestRow[]
  selectedKey: TestKey | null
  onSelect: (key: TestKey) => void
  onNewTest: () => void
  headerExtra?: React.ReactNode
  /** A test was moved to the Trash (the page leaves it when it was the selected one) */
  onDeleted?: (key: TestKey) => void
}

// Keys typed into a field, an editor or Monaco are theirs, never the list's
const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !==
      null ||
    target.closest('.monaco-editor') !== null)

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
  headerExtra,
  onDeleted
}) => {
  const { t } = useTranslation()
  const layout = useProjectStore((s) => s.layout)
  const projectPath = useProjectStore((s) => s.projectPath)
  // Only a run of this project says anything about its files
  const run = useRunStore((s) => (s.run && s.run.projectPath === projectPath ? s.run : null))
  const clipboard = useTestClipboardStore((s) => s.item)
  // The whole list, not just the rows a tag filter shows: the selection may be filtered out
  const allRows = useTestsListStore((s) => s.rows) ?? rows
  const selectedRow = allRows.find((r) => testKeyOf(r) === selectedKey) ?? null
  const [menu, setMenu] = useState<{ x: number; y: number; row: TestRow | null } | null>(null)
  const [confirming, setConfirming] = useState<TestRow | null>(null)

  const askDelete = (row: TestRow): void => {
    if (row.file) setConfirming(row)
  }
  const confirmDelete = async (): Promise<void> => {
    const row = confirming
    setConfirming(null)
    if (row && (await trashTestRow(row))) onDeleted?.(testKeyOf(row))
  }

  // The menu bar's Edit › Copy/Paste/Duplicate/Delete Test act on the selected test
  const current = useRef({ selectedRow, projectPath, confirming })
  current.current = { selectedRow, projectPath, confirming }
  useEffect(
    () =>
      onMenuCommand((command) => {
        const { selectedRow: row, projectPath: project, confirming: busy } = current.current
        if (busy || !project) return
        if (command === 'paste-test') void pasteTest(row)
        if (!row) return
        if (command === 'copy-test') void copyTest(row)
        if (command === 'duplicate-test') void duplicateTest(row)
        if (command === 'delete-test') askDelete(row)
      }),
    []
  )

  // Copy, Paste, Duplicate and Delete keys while the list has focus: on the focused row, else
  // on the selected one
  const onListKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (isEditable(e.target)) return
    const mod = e.metaKey || e.ctrlKey
    const focused = (e.target as HTMLElement).closest?.('[data-test-key]')
    const key = focused?.getAttribute('data-test-key')
    const row = (key && allRows.find((r) => testKeyOf(r) === key)) || selectedRow
    const letter = mod && !e.shiftKey && !e.altKey ? e.key.toLowerCase() : null
    if (letter === 'v') {
      e.preventDefault()
      void pasteTest(row)
      return
    }
    if (!row) return
    if (letter === 'c') {
      e.preventDefault()
      void copyTest(row)
    } else if (letter === 'd') {
      e.preventDefault()
      void duplicateTest(row)
    } else if ((e.key === 'Delete' && !mod) || (e.key === 'Backspace' && mod)) {
      e.preventDefault()
      askDelete(row)
    }
  }

  const openMenu = (e: React.MouseEvent, row: TestRow | null): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, row })
  }
  const menuItems = (
    row: TestRow | null
  ): { label: string; onClick: () => void; disabled?: boolean }[] => {
    const paste = {
      label: t('tests.menu.paste'),
      onClick: (): void => void pasteTest(row ?? selectedRow),
      disabled: !clipboard
    }
    if (!row) return [paste]
    return [
      { label: t('tests.menu.copy'), onClick: (): void => void copyTest(row) },
      paste,
      { label: t('tests.menu.duplicate'), onClick: (): void => void duplicateTest(row) },
      { label: t('tests.menu.delete'), onClick: (): void => askDelete(row), disabled: !row.file }
    ]
  }

  const restore = async (row: TestRow): Promise<void> => {
    const fail = (error: unknown): void => {
      console.error('Restoring the test failed:', error)
      toast.error(t('tests.restoreFailed'))
    }
    try {
      const tests = await window.api.getTests()
      const test = tests.find((x) => x.id === row.testId)
      if (!test) return fail(`No saved test ${row.testId}`)
      const result = await window.api.saveRecording(activeProjectPath(), test)
      if (!result.success) return fail(result.error)
      toast.success(t('tests.restored'))
      await useTestsListStore.getState().reload()
    } catch (error) {
      fail(error)
    }
  }

  // "Record one" only where recording is possible
  const emptyKey = layout && !layout.recordable ? 'tests.emptyNoRecording' : 'tests.empty'

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-neutral-bdr">
        <Tooltip
          content={t('tooltips.tests.newTest')}
          shortcut="new-test"
          position="bottom"
          className="flex-1"
        >
          <button className={`${rowButton} h-7 flex-1 whitespace-nowrap`} onClick={onNewTest}>
            {t('tests.newTest')}
          </button>
        </Tooltip>
        {headerExtra}
      </div>
      {rows.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-2 flex-1 text-neutral-md text-sm p-6 text-center"
          onContextMenu={(e) => openMenu(e, null)}
          data-testid="tests-empty"
        >
          {t(emptyKey)}
          {emptyKey === 'tests.empty' && (
            <DocsLink id="docs.recorder" topic={t('docs.topics.recording')}>
              {t('docs.howRecordingWorks')}
            </DocsLink>
          )}
        </div>
      ) : (
        <ul
          className="flex-1 overflow-y-auto divide-y divide-neutral-bdr"
          onContextMenu={(e) => openMenu(e, null)}
          onKeyDown={onListKeyDown}
        >
          {rows.map((row) => {
            const key = testKeyOf(row)
            const selected = key === selectedKey
            const editedInCode =
              row.ownership === 'code' || row.ownership === 'codeOwnedWasRecorded'
            const status = row.file ? fileStatus(run, row.file) : null
            return (
              <li
                key={key}
                role="button"
                tabIndex={0}
                aria-current={selected ? 'true' : undefined}
                data-test-key={key}
                onClick={() => onSelect(key)}
                onContextMenu={(e) => openMenu(e, row)}
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
                    <Tooltip content={t('tooltips.tests.restore')} position="left">
                      <button
                        className={rowButton}
                        onClick={(e) => {
                          e.stopPropagation()
                          restore(row)
                        }}
                      >
                        {t('tests.restore')}
                      </button>
                    </Tooltip>
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
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems(menu.row)}
          onClose={() => setMenu(null)}
        />
      )}
      {confirming && (
        <ConfirmationModal
          title={t('tests.delete.title')}
          subject={confirming.name}
          message={t('tests.delete.message')}
          confirmLabel={t('tests.delete.confirm')}
          cancelLabel={t('tests.delete.cancel')}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  )
}

export default TestsList
