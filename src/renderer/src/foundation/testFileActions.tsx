import React from 'react'
import toast from 'react-hot-toast'
import i18n from 'i18next'
import { activeProjectPath } from '@foundation/activeProject'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useTestClipboardStore, type ClipboardTest } from '@foundation/Stores/testClipboardStore'
import type { Test } from '@foundation/Types/test'
import type { TestKey, TestRow } from '@foundation/testKey'

/**
 * The Tests list's Copy, Paste, Duplicate and Delete. Files are only ever read, written and
 * trashed by main; the renderer names project-relative spec paths.
 */

const UNDO_WINDOW_MS = 6000

const fail = (key: string, error?: unknown): void => {
  if (error !== undefined) console.error(`${key}:`, error)
  toast.error(i18n.t(key))
}

/** `<name> copy`, then `<name> copy 2`, `<name> copy 3`… : the first one not in `taken`. */
export function uniqueCopyName(name: string, taken: string[]): string {
  const names = new Set(taken)
  if (!names.has(`${name} copy`)) return `${name} copy`
  for (let n = 2; ; n++) if (!names.has(`${name} copy ${n}`)) return `${name} copy ${n}`
}

/** What Copy takes from a row: a recorded test's saved steps, or a code file's text. */
async function clipboardItemOf(row: TestRow): Promise<ClipboardTest | null> {
  if (row.ownership === 'recorded' && row.testId) {
    const saved = (await window.api.getTests()).find((t) => t.id === row.testId)
    if (!saved) return null
    const test: Test = { id: saved.id, name: saved.name, url: saved.url, steps: saved.steps }
    if (saved.tags?.length) test.tags = saved.tags
    return { kind: 'recorded', test }
  }
  if (!row.file) return null
  const result = await window.api.readTestFile(activeProjectPath(), row.file)
  if (!result.success) return null
  return { kind: 'code', name: row.name, fileText: result.text, relFile: row.file }
}

async function itemOrFail(row: TestRow, failKey: string): Promise<ClipboardTest | null> {
  try {
    const item = await clipboardItemOf(row)
    if (!item) fail(failKey)
    return item
  } catch (error) {
    fail(failKey, error)
    return null
  }
}

// Flows are listed with the tests but can't be copied yet (their copy would become a test)
const refusedFlow = (row: TestRow): boolean => {
  if (row.kind !== 'flow') return false
  fail('tests.menu.flowNoCopy')
  return true
}

/** Copy: the row's test onto the app's clipboard. */
export async function copyTest(row: TestRow): Promise<void> {
  if (refusedFlow(row)) return
  const item = await itemOrFail(row, 'tests.menu.copyFailed')
  if (!item) return
  useTestClipboardStore.getState().setItem(item)
  toast.success(i18n.t('tests.menu.copied'))
}

const reload = (): Promise<void> => useTestsListStore.getState().reload()

/** Every test's name in the open project, loading the list first if nothing has loaded it. */
async function takenNames(): Promise<string[]> {
  if (useTestsListStore.getState().rows === null) await reload()
  return (useTestsListStore.getState().rows ?? []).map((r) => r.name)
}

type TrashedHandler = (keys: TestKey[]) => void
const trashedHandlers = new Set<TrashedHandler>()

/**
 * Hears about tests moved to the Trash (Delete, or Undo of a Paste), by every key the test
 * may be open under, so a page showing it can leave. Returns the unsubscribe.
 */
export function onTestTrashed(handler: TrashedHandler): () => void {
  trashedHandlers.add(handler)
  return (): void => {
    trashedHandlers.delete(handler)
  }
}

// The file went to the Trash but Raider's record of it could not: it lists as a missing file
const warnRecordLeft = (): void => {
  toast(i18n.t('tests.menu.trashedRecordLeft'), { icon: '⚠️' })
}

function announceTrashed(file: string, testId?: string): void {
  const keys: TestKey[] = [`file:${file}`, ...(testId ? [`id:${testId}`] : [])]
  for (const handler of Array.from(trashedHandlers)) handler(keys)
}

const UndoToast: React.FC<{ message: string; onUndo: () => void }> = ({ message, onUndo }) => (
  <span className="flex items-center gap-3 text-sm text-neutral-dark">
    {message}
    <button
      type="button"
      onClick={onUndo}
      className="font-semibold text-ruby underline underline-offset-2"
    >
      {i18n.t('tests.menu.undo')}
    </button>
  </span>
)

/**
 * Offers Undo for a new file: it goes to the Trash like a Delete, in the project it was made
 * in. Switching project dismisses the offer; an Undo that still arrives later does nothing.
 */
function offerUndo(projectPath: string, file: string, message: string): void {
  const toastId = `test-pasted-${file}`
  let done = false
  const stopWatching = useProjectStore.subscribe((state) => {
    if (state.projectPath !== projectPath) {
      toast.dismiss(toastId)
      stopWatching()
    }
  })
  setTimeout(stopWatching, UNDO_WINDOW_MS)
  const undo = async (): Promise<void> => {
    if (done) return
    done = true
    toast.dismiss(toastId)
    stopWatching()
    if (activeProjectPath() !== projectPath) {
      toast.error(i18n.t('tests.menu.undoOtherProject'))
      return
    }
    try {
      const result = await window.api.trashTest(projectPath, file)
      if (!result.success) return fail('tests.menu.undoFailed', result.error)
      if (result.recordLeft) warnRecordLeft()
      announceTrashed(file, result.testId)
      await reload()
    } catch (error) {
      fail('tests.menu.undoFailed', error)
    }
  }
  toast(() => <UndoToast message={message} onUndo={() => void undo()} />, {
    duration: UNDO_WINDOW_MS,
    id: toastId
  })
}

export interface PasteOptions {
  /** The tag the list is filtered by: the toast says when it hides the new test */
  activeTag?: string | null
}

/** Copies tags onto a pasted recorded test, unless the project changed meanwhile. */
async function copyTags(projectPath: string, file: string, tags: string[]): Promise<void> {
  if (activeProjectPath() !== projectPath) return
  const result = await window.api.setTestTags(file, tags).catch((error: unknown) => {
    console.error('Copying the tags failed:', error)
    return null
  })
  if (!result?.success) toast(i18n.t('tests.menu.tagsNotCopied'), { icon: '⚠️' })
}

/** Writes `item` as a new test of the open project; returns its file, or null. */
async function pasteItem(
  item: ClipboardTest,
  near: TestRow | null,
  messageKey: string,
  failKey: string,
  { activeTag }: PasteOptions = {}
): Promise<string | null> {
  const projectPath = activeProjectPath()
  if (!projectPath) return null
  try {
    const name = uniqueCopyName(
      item.kind === 'recorded' ? item.test.name : item.name,
      await takenNames()
    )
    let file: string | undefined
    if (item.kind === 'recorded') {
      const test: Test = {
        id: crypto.randomUUID(),
        name,
        url: item.test.url,
        steps: item.test.steps
      }
      const result = await window.api.saveRecording(projectPath, test)
      if (!result.success) {
        fail(failKey, result.error)
        return null
      }
      file = result.test?.file
      // A save never takes tags from its caller: the copy gets them the way the page sets them
      if (file && item.test.tags?.length) await copyTags(projectPath, file, item.test.tags)
    } else {
      // Main renames the file's first describe to `name` when it is a plain string
      const result = await window.api.pasteTestFile(projectPath, {
        text: item.fileText,
        sourceFile: item.relFile,
        ...(near?.file ? { nearFile: near.file } : {}),
        name
      })
      if (!result.success) {
        fail(failKey, result.error)
        return null
      }
      file = result.file
    }
    await reload()
    const added = useTestsListStore.getState().rows?.find((r) => r.file === file)
    const hidden = !!activeTag && !!added && !added.tags.includes(activeTag)
    const message = hidden
      ? `${i18n.t(messageKey)} ${i18n.t('tests.menu.hiddenByTag', { tag: activeTag })}`
      : i18n.t(messageKey)
    if (file) offerUndo(projectPath, file, message)
    else toast.success(message)
    return file ?? null
  } catch (error) {
    fail(failKey, error)
    return null
  }
}

/** Paste: the clipboard's test as a new one in the open project, next to `near` when given. */
export async function pasteTest(near: TestRow | null, options?: PasteOptions): Promise<void> {
  const item = useTestClipboardStore.getState().item
  if (!item) return
  await pasteItem(item, near, 'tests.menu.pasted', 'tests.menu.pasteFailed', options)
}

/** Duplicate: Copy and Paste of `row` in place, leaving the clipboard alone. */
export async function duplicateTest(row: TestRow, options?: PasteOptions): Promise<void> {
  if (refusedFlow(row)) return
  const item = await itemOrFail(row, 'tests.menu.duplicateFailed')
  if (!item) return
  await pasteItem(item, row, 'tests.menu.duplicated', 'tests.menu.duplicateFailed', options)
}

/** Delete (once confirmed): main moves the row's file, and its record, to the Trash. */
export async function trashTestRow(row: TestRow): Promise<boolean> {
  const projectPath = activeProjectPath()
  if (!projectPath || !row.file) return false
  try {
    const result = await window.api.trashTest(projectPath, row.file)
    if (!result.success) {
      fail('tests.menu.deleteFailed', result.error)
      return false
    }
    if (result.recordLeft) warnRecordLeft()
    else toast.success(i18n.t('tests.menu.trashed'))
    announceTrashed(row.file, result.testId ?? row.testId)
    await reload()
    return true
  } catch (error) {
    fail('tests.menu.deleteFailed', error)
    return false
  }
}
