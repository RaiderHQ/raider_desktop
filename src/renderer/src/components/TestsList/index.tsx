import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Tooltip from '@components/Tooltip'
import DocsLink from '@components/DocsLink'
import ContextMenu from '@components/ContextMenu'
import ConfirmationModal from '@components/ConfirmationModal'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { useTickedTestsStore } from '@foundation/Stores/tickedTestsStore'
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
  /** The tag the list is filtered by: a paste the filter hides says so */
  activeTag?: string | null
  /** Schedule… in Select mode hands it the ticked spec files; no handler, no button */
  onScheduleTicked?: (files: string[]) => void
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
  activeTag = null,
  onScheduleTicked
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

  // Select mode: a click ticks a row (by its spec file) instead of opening it. It lives only as
  // long as the list, so recording (which folds the list away) ends it; the ticks stay in the store
  const [selecting, setSelecting] = useState(false)
  const tickedFiles = useTickedTestsStore((s) =>
    projectPath ? s.byProject[projectPath] : undefined
  )
  const tickedSet = useMemo(() => new Set(tickedFiles ?? []), [tickedFiles])
  // In list order, for the count, Run and Schedule…
  const listedTicked = allRows.flatMap((r) => (r.file && tickedSet.has(r.file) ? [r.file] : []))
  // Where a Shift-click's range starts: the row clicked last
  const anchor = useRef<TestKey | null>(null)

  // A file that left the list (deleted, renamed, reloaded) is no longer ticked
  useEffect(() => {
    if (!projectPath) return
    useTickedTestsStore.getState().prune(
      projectPath,
      allRows.flatMap((r) => (r.file ? [r.file] : []))
    )
  }, [allRows, projectPath])

  const tick = (row: TestRow, range: boolean): void => {
    if (!projectPath || !row.file) return
    const key = testKeyOf(row)
    const from =
      range && anchor.current ? rows.findIndex((r) => testKeyOf(r) === anchor.current) : -1
    const to = rows.findIndex((r) => testKeyOf(r) === key)
    anchor.current = key
    const store = useTickedTestsStore.getState()
    if (from === -1 || to === -1) return store.toggle(projectPath, row.file)
    const span = rows.slice(Math.min(from, to), Math.max(from, to) + 1)
    store.setRange(
      projectPath,
      span.flatMap((r) => (r.file ? [r.file] : [])),
      true
    )
  }

  const runTicked = (): void => {
    if (listedTicked.length === 0) return
    void useRunStore
      .getState()
      .start(
        { kind: 'files', files: listedTicked },
        { route: '/overview/tests', label: t('tests.ticked', { count: listedTicked.length }) }
      )
  }

  // Esc leaves Select mode, unless a menu or the delete confirmation has it
  const onRootKeyDown = (e: React.KeyboardEvent<HTMLElement>): void => {
    if (!selecting || e.key !== 'Escape' || menu || confirming || isEditable(e.target)) return
    e.preventDefault()
    setSelecting(false)
  }

  const askDelete = (row: TestRow): void => {
    if (row.file) setConfirming(row)
  }
  const confirmDelete = async (): Promise<void> => {
    const row = confirming
    setConfirming(null)
    // TestsWorkspace hears about it and leaves the test if it was open
    if (row) await trashTestRow(row)
  }

  // The menu bar's Edit › Copy/Paste/Duplicate/Delete Test act on the selected test
  const current = useRef({ selectedRow, projectPath, confirming, activeTag })
  current.current = { selectedRow, projectPath, confirming, activeTag }
  useEffect(
    () =>
      onMenuCommand((command) => {
        // These come only from clicking the menu: the items have no key on macOS, and elsewhere
        // their keys are shown but not registered, so typing in a field never sends them
        const {
          selectedRow: row,
          projectPath: project,
          confirming: busy,
          activeTag: tag
        } = current.current
        if (busy || !project) return
        if (command === 'paste-test') void pasteTest(row, { activeTag: tag })
        if (!row) return
        if (command === 'copy-test') void copyTest(row)
        if (command === 'duplicate-test') void duplicateTest(row, { activeTag: tag })
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
    // The letter typed when it is a Latin one (Dvorak's C is C); on a non-Latin layout, the
    // letter of the key position (KeyC), so Cmd+C still copies
    const typed = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : /^Key([A-Z])$/.exec(e.code)?.[1]
    const letter = mod && !e.shiftKey && !e.altKey ? typed?.toLowerCase() : undefined
    if (letter === 'v') {
      e.preventDefault()
      void pasteTest(row, { activeTag })
      return
    }
    if (!row) return
    if (letter === 'c') {
      e.preventDefault()
      void copyTest(row)
    } else if (letter === 'd') {
      e.preventDefault()
      void duplicateTest(row, { activeTag })
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
      onClick: (): void => void pasteTest(row ?? selectedRow, { activeTag }),
      disabled: !clipboard
    }
    if (!row) return [paste]
    return [
      { label: t('tests.menu.copy'), onClick: (): void => void copyTest(row) },
      paste,
      {
        label: t('tests.menu.duplicate'),
        onClick: (): void => void duplicateTest(row, { activeTag })
      },
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
    <div className="flex flex-col h-full min-h-0" onKeyDown={onRootKeyDown}>
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
        <Tooltip content={t('tooltips.testsList.select')} position="bottom">
          <button
            className={`${rowButton} h-7 whitespace-nowrap aria-pressed:bg-neutral-lt`}
            aria-pressed={selecting}
            onClick={() => setSelecting((on) => !on)}
          >
            {t('tests.select')}
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
            const isTicked = !!row.file && tickedSet.has(row.file)
            return (
              <li
                key={key}
                // In Select mode the row is the tick box; a row with no spec file can't be ticked
                role={selecting ? 'checkbox' : 'button'}
                aria-checked={selecting ? isTicked : undefined}
                aria-disabled={selecting && !row.file ? true : undefined}
                aria-label={selecting ? t('tests.tick', { name: row.name }) : undefined}
                tabIndex={0}
                aria-current={selected ? 'true' : undefined}
                data-test-key={key}
                onClick={(e) => (selecting ? tick(row, e.shiftKey) : onSelect(key))}
                onContextMenu={(e) => openMenu(e, row)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (selecting) tick(row, false)
                    else onSelect(key)
                  }
                }}
                className={`flex items-center gap-2 py-2.5 px-3 cursor-pointer text-sm hover:bg-neutral-50 ${
                  selected ? 'bg-neutral-lt' : ''
                } ${selecting ? 'select-none' : ''}`}
              >
                {selecting && (
                  <span
                    aria-hidden
                    className={`flex items-center justify-center w-4 h-4 shrink-0 rounded border text-[10px] leading-none ${
                      isTicked
                        ? 'bg-ruby border-ruby text-white'
                        : row.file
                          ? 'border-neutral-bdr bg-white'
                          : 'border-neutral-bdr bg-neutral-lt'
                    }`}
                  >
                    {isTicked ? '✓' : ''}
                  </span>
                )}
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
      {selecting && (
        <div
          data-testid="ticked-footer"
          className="flex flex-wrap items-center gap-2 p-3 border-t border-neutral-bdr"
        >
          <span className="flex-1 text-xs text-neutral-dk whitespace-nowrap" aria-live="polite">
            {t('tests.ticked', { count: listedTicked.length })}
          </span>
          <Tooltip content={t('tooltips.testsList.runTicked')} position="top">
            <button
              className={`${rowButton} disabled:opacity-50 disabled:cursor-not-allowed`}
              disabled={listedTicked.length === 0}
              onClick={runTicked}
            >
              {t('tests.runTicked')}
            </button>
          </Tooltip>
          {onScheduleTicked && (
            <Tooltip content={t('tooltips.testsList.scheduleTicked')} position="top">
              <button
                className={`${rowButton} disabled:opacity-50 disabled:cursor-not-allowed`}
                disabled={listedTicked.length === 0}
                onClick={() => onScheduleTicked(listedTicked)}
              >
                {t('tests.scheduleTicked')}
              </button>
            </Tooltip>
          )}
          <Tooltip content={t('tooltips.testsList.clearTicked')} position="top">
            <button
              className={`${rowButton} disabled:opacity-50 disabled:cursor-not-allowed`}
              disabled={listedTicked.length === 0}
              onClick={() => projectPath && useTickedTestsStore.getState().clear(projectPath)}
            >
              {t('tests.clearTicked')}
            </button>
          </Tooltip>
        </div>
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
