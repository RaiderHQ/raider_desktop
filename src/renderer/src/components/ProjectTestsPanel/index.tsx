import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import Tooltip from '@components/Tooltip'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { Ownership, ProjectTestEntry } from '@shared/types/projectTest'
import type { Test } from '@foundation/Types/test'

const BADGE: Record<Ownership, { key: string; className: string }> = {
  recorded: { key: 'tests.badge.recorded', className: 'bg-status-ok-bg text-status-ok' },
  codeOwnedWasRecorded: {
    key: 'tests.badge.codeOwned',
    className: 'bg-amber-50 text-amber-700'
  },
  code: { key: 'tests.badge.code', className: 'bg-neutral-lt text-neutral-dk' }
}

const rowButton =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr text-neutral-dk bg-white hover:bg-neutral-50 transition-colors font-medium'

/** Every test in the project, recorded or written by a developer, with who may change it. */
const ProjectTestsPanel: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [entries, setEntries] = useState<ProjectTestEntry[] | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setEntries(await window.api.listProjectTests())
    } catch (error) {
      console.error('Listing the project tests failed:', error)
      setEntries([])
    }
  }, [])

  useEffect(() => {
    load()
    // Listings change when tests are recorded, migrated or saved elsewhere
    const off = window.electron?.ipcRenderer?.on('suite-updated', () => {
      load()
    })
    return (): void => off?.()
  }, [load])

  const findInSuites = async (testId: string): Promise<{ suiteId: string; test: Test } | null> => {
    const suites = await window.api.getSuites()
    for (const suite of suites) {
      const test = suite.tests.find((x) => x.id === testId)
      if (test) return { suiteId: suite.id, test }
    }
    return null
  }

  const fail = (error: unknown): void => {
    console.error('Tests tab action failed:', error)
    toast.error(t('tests.actionFailed'))
  }

  const edit = async (entry: ProjectTestEntry): Promise<void> => {
    try {
      const found = entry.testId ? await findInSuites(entry.testId) : null
      if (!found) return fail(`No suite lists test ${entry.testId}`)
      const store = useRecorderStore.getState()
      store.setReadOnlyView(null)
      store.setActiveSuiteId(found.suiteId)
      store.setActiveTest(found.test)
      store.setOpenTarget({ suiteId: found.suiteId, testId: found.test.id })
      navigate('/recorder')
    } catch (error) {
      fail(error)
    }
  }

  const view = async (entry: ProjectTestEntry): Promise<void> => {
    try {
      const codeView = await window.api.openCodeTest(entry.file)
      useRecorderStore.getState().setReadOnlyView(codeView, entry.name)
      navigate('/recorder')
    } catch (error) {
      fail(error)
    }
  }

  const restore = async (entry: ProjectTestEntry): Promise<void> => {
    const failRestore = (error: unknown): void => {
      console.error('Restoring the test failed:', error)
      toast.error(t('tests.restoreFailed'))
    }
    try {
      const found = entry.testId ? await findInSuites(entry.testId) : null
      if (!found) return failRestore(`No suite lists test ${entry.testId}`)
      const result = await window.api.saveRecording(found.suiteId, found.test)
      if (!result.success) return failRestore(result.error)
      toast.success(t('tests.restored'))
      await load()
    } catch (error) {
      failRestore(error)
    }
  }

  if (entries === null) return <div />

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-mid text-sm p-8 text-center">
        {t('tests.empty')}
      </div>
    )
  }

  return (
    <ul className="divide-y divide-neutral-bdr">
      {entries.map((entry) => {
        const badge = BADGE[entry.ownership]
        return (
          <li key={entry.file} className="flex items-center gap-3 py-2.5 px-1">
            <Tooltip content={entry.file} position="right" className="flex-1 min-w-0">
              <span className="text-sm text-neutral-dark truncate">{entry.name}</span>
            </Tooltip>
            {entry.missingFile ? (
              <>
                <span className="text-xs px-2 py-0.5 rounded-full bg-status-err-bg text-red-600 font-medium">
                  {t('tests.fileMissing')}
                </span>
                <button className={rowButton} onClick={() => restore(entry)}>
                  {t('tests.restore')}
                </button>
              </>
            ) : (
              <>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                  {t(badge.key)}
                </span>
                {entry.ownership === 'recorded' ? (
                  <button className={rowButton} onClick={() => edit(entry)}>
                    {t('tests.edit')}
                  </button>
                ) : (
                  <button className={rowButton} onClick={() => view(entry)}>
                    {t('tests.view')}
                  </button>
                )}
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

export default ProjectTestsPanel
