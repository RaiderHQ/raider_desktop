import React from 'react'
import toast from 'react-hot-toast'
import i18n from 'i18next'
import { activeProjectPath } from '@foundation/activeProject'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useTestClipboardStore, type ClipboardTest } from '@foundation/Stores/testClipboardStore'
import type { Test } from '@foundation/Types/test'
import type { TestRow } from '@foundation/testKey'

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

/** Copy: the row's test onto the app's clipboard. */
export async function copyTest(row: TestRow): Promise<void> {
  const item = await itemOrFail(row, 'tests.menu.copyFailed')
  if (!item) return
  useTestClipboardStore.getState().setItem(item)
  toast.success(i18n.t('tests.menu.copied'))
}

const reload = (): Promise<void> => useTestsListStore.getState().reload()

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

/** Offers Undo for a new file: it goes to the Trash like a Delete, in the project it was made in. */
function offerUndo(projectPath: string, file: string, messageKey: string): void {
  let done = false
  const undo = async (toastId: string): Promise<void> => {
    if (done) return
    done = true
    toast.dismiss(toastId)
    try {
      const result = await window.api.trashTest(projectPath, file)
      if (!result.success) return fail('tests.menu.undoFailed', result.error)
      await reload()
    } catch (error) {
      fail('tests.menu.undoFailed', error)
    }
  }
  toast(
    (instance) => <UndoToast message={i18n.t(messageKey)} onUndo={() => void undo(instance.id)} />,
    { duration: UNDO_WINDOW_MS, id: `test-pasted-${file}` }
  )
}

/** Writes `item` as a new test of the open project; returns its file, or null. */
async function pasteItem(
  item: ClipboardTest,
  near: TestRow | null,
  messageKey: string,
  failKey: string
): Promise<string | null> {
  const projectPath = activeProjectPath()
  if (!projectPath) return null
  try {
    let file: string | undefined
    if (item.kind === 'recorded') {
      const taken = (useTestsListStore.getState().rows ?? []).map((r) => r.name)
      const test: Test = {
        id: crypto.randomUUID(),
        name: uniqueCopyName(item.test.name, taken),
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
      if (file && item.test.tags?.length) {
        await window.api.setTestTags(file, item.test.tags).catch(() => undefined)
      }
    } else {
      const result = await window.api.pasteTestFile(projectPath, {
        text: item.fileText,
        sourceFile: item.relFile,
        ...(near?.file ? { nearFile: near.file } : {})
      })
      if (!result.success) {
        fail(failKey, result.error)
        return null
      }
      file = result.file
    }
    await reload()
    if (file) offerUndo(projectPath, file, messageKey)
    else toast.success(i18n.t(messageKey))
    return file ?? null
  } catch (error) {
    fail(failKey, error)
    return null
  }
}

/** Paste: the clipboard's test as a new one in the open project, next to `near` when given. */
export async function pasteTest(near: TestRow | null): Promise<void> {
  const item = useTestClipboardStore.getState().item
  if (!item) return
  await pasteItem(item, near, 'tests.menu.pasted', 'tests.menu.pasteFailed')
}

/** Duplicate: Copy and Paste of `row` in place, leaving the clipboard alone. */
export async function duplicateTest(row: TestRow): Promise<void> {
  const item = await itemOrFail(row, 'tests.menu.duplicateFailed')
  if (!item) return
  await pasteItem(item, row, 'tests.menu.duplicated', 'tests.menu.duplicateFailed')
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
    toast.success(i18n.t('tests.menu.trashed'))
    await reload()
    return true
  } catch (error) {
    fail('tests.menu.deleteFailed', error)
    return false
  }
}
