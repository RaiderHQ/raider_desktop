import React, { SetStateAction, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import CommandList from '@components/CommandList'
import OutputPanel from '@components/OutputPanel'
import StyledPanel from '@components/StyledPanel'
import Dropdown from '@components/Dropdown'
import DeleteModal from '@components/DeleteModal'
import ConfirmationModal from '@components/ConfirmationModal'
import AssertionTextModal from '@components/AssertionTextModal'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { buildAssertionStep, assertionModalType } from '@foundation/assertionStep'
import { handleSaveResult } from '@foundation/saveResult'
import { testKeyOf } from '@foundation/testKey'
import type { TestRow } from '@foundation/testKey'
import type { Step } from '@shared/types/step'
import { useTestRecording } from '../../hooks/useTestRecording'

interface TestPageProps {
  row: TestRow
}

const field =
  'block w-full px-3 py-1 border border-neutral-bdr rounded text-sm focus:ring-ruby focus:border-ruby transition-colors disabled:bg-neutral-lt disabled:cursor-not-allowed'

const toolbarButton =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr font-medium transition-colors bg-white disabled:text-neutral-mid disabled:cursor-not-allowed'

/** A recorded test: its name, start URL, steps, and what can be done with it. */
const TestPage: React.FC<TestPageProps> = ({ row }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const recording = useTestRecording()
  const activeTest = useRecorderStore((s) => s.activeTest)
  const activeSuiteId = useRecorderStore((s) => s.activeSuiteId)
  const isRunning = useRecorderStore((s) => s.isRunning)
  const showCode = useRecorderStore((s) => s.showCode)
  const isOutputVisible = useRecorderStore((s) => s.isOutputVisible)
  const breakpointIndex = useRecorderStore((s) => s.breakpointIndex)
  const isReplaying = useRecorderStore((s) => s.isReplayingToBreakpoint)
  const recordingDisabled = useProjectStore((s) => s.layout?.recordable === false)
  const runOutput = useRunOutputStore((s) => s.runOutput)
  const { updateActiveTest, setShowCode, setIsOutputVisible, setBreakpointIndex } =
    useRecorderStore.getState()

  const key = testKeyOf(row)
  const [openFailed, setOpenFailed] = useState(false)
  useEffect(() => {
    let current = true
    setOpenFailed(false)
    useRecorderStore
      .getState()
      .openTest(row)
      .catch((error: unknown) => {
        console.error('Opening the test failed:', error)
        if (current) setOpenFailed(true)
      })
    return (): void => {
      current = false
    }
  }, [key])

  const test = activeTest && activeTest.id === row.testId ? activeTest : null
  const readOnly = !!test?.ownership && test.ownership !== 'recorded'
  const busy = recording.isRecording || isReplaying

  // The name is kept here while typing and saved on blur or Enter: main renames the
  // test's file on a real rename, so a half-typed name must never reach it
  const [nameDraft, setNameDraft] = useState(test?.name ?? '')
  useEffect(() => setNameDraft(test?.name ?? ''), [test?.id, test?.name])
  const commitName = (): void => {
    const name = nameDraft.trim()
    if (!name) {
      setNameDraft(test?.name ?? '')
      return
    }
    if (!test || readOnly || name === test.name) return
    updateActiveTest((p) => (p ? { ...p, name } : null))
    // Saved right away, not left to the debounce: opening another test cancels that timer
    const renamed = { ...test, name }
    if (activeSuiteId) {
      Promise.resolve(window.api.saveRecording(activeSuiteId, renamed))
        .then((result) => handleSaveResult(result, renamed.id, t))
        .catch((error: unknown) => console.error('Saving the new name failed:', error))
    }
  }

  const [confirmingStartOver, setConfirmingStartOver] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const record = (): void => {
    if (!test) return
    const action = test.steps.length > 0 ? recording.continueRecording : recording.start
    action({ kind: 'test' }).catch((error: unknown) => console.error('Recording failed:', error))
  }

  const startOver = (): void => {
    setConfirmingStartOver(false)
    recording
      .start({ kind: 'test' })
      .catch((error: unknown) => console.error('Recording failed:', error))
  }

  const exportTest = async (): Promise<void> => {
    if (!test?.steps.length) {
      toast.error(t('recorder.mainRecorderPanel.exportError', { error: t('testPage.noSteps') }))
      return
    }
    try {
      const result = await window.api.exportTest(test.name, test.steps)
      if (result.success) {
        toast.success(
          t('recorder.mainRecorderPanel.exportSuccess', { exportType: 'Test', path: result.path })
        )
      } else {
        toast.error(t('recorder.mainRecorderPanel.exportError', { error: result.error }))
      }
    } catch (error) {
      toast.error(t('recorder.mainRecorderPanel.exportError', { error: String(error) }))
    }
  }

  const deleteTest = (): void => {
    setConfirmingDelete(false)
    if (!activeSuiteId || !test) return
    Promise.resolve(window.api.deleteTest(activeSuiteId, test.id)).catch((error: unknown) =>
      console.error('Deleting the test failed:', error)
    )
    navigate('/overview/tests')
  }

  const saveAssertion = (expectedText: string): void => {
    const info = recording.assertionInfo
    if (info) {
      const step = buildAssertionStep(info.pendingAssertion, info.element, expectedText)
      updateActiveTest((p) => (p ? { ...p, steps: [...p.steps, step] } : null))
    }
    recording.setAssertionInfo(null)
  }

  const moreOptions = [
    ...(readOnly || recordingDisabled
      ? []
      : [{ label: t('testPage.startOver'), onClick: (): void => setConfirmingStartOver(true) }]),
    { label: t('testPage.exportTest'), onClick: (): void => void exportTest() },
    { label: t('testPage.deleteTest'), onClick: (): void => setConfirmingDelete(true) }
  ]

  const steps = test ? (
    <CommandList
      steps={test.steps}
      setSteps={(next: SetStateAction<Step[]>) =>
        updateActiveTest((p) =>
          p ? { ...p, steps: typeof next === 'function' ? next(p.steps) : next } : null
        )
      }
      onDeleteStep={(index) =>
        updateActiveTest((p) => (p ? { ...p, steps: p.steps.filter((_, i) => i !== index) } : null))
      }
      onEditStep={(index, step) =>
        updateActiveTest((p) =>
          p ? { ...p, steps: p.steps.map((s, i) => (i === index ? step : s)) } : null
        )
      }
      showCode={showCode}
      breakpointIndex={breakpointIndex}
      onSetBreakpoint={setBreakpointIndex}
      onClearBreakpoint={() => setBreakpointIndex(null)}
      onRecordFromHere={(index) =>
        recording
          .recordFromHere(index, { kind: 'test' })
          .catch((error: unknown) => console.error('Recording failed:', error))
      }
      readOnly={readOnly}
    />
  ) : null

  const browserOpen = (recording.recordingUrl && recording.preloadPath) || isReplaying

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <nav aria-label={t('testPage.breadcrumb')} className="flex items-center gap-1.5 text-sm">
        <Link to="/overview/tests" className="text-neutral-mid hover:text-neutral-dark">
          {t('testPage.breadcrumbRoot')}
        </Link>
        <span className="text-neutral-mid">/</span>
        <span className="font-semibold text-neutral-dark truncate">{test?.name ?? row.name}</span>
      </nav>

      {openFailed ? (
        <p className="text-sm text-neutral-mid">{t('tests.actionFailed')}</p>
      ) : !test ? null : (
        <>
          <div className="flex items-center gap-4">
            <input
              type="text"
              className={field}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => e.key === 'Enter' && commitName()}
              placeholder={t('testPage.name')}
              aria-label={t('testPage.name')}
              disabled={readOnly}
            />
            <input
              type="text"
              className={field}
              value={test.url ?? ''}
              onChange={(e) => updateActiveTest((p) => (p ? { ...p, url: e.target.value } : null))}
              placeholder={t('testPage.url')}
              aria-label={t('testPage.url')}
              disabled={readOnly}
            />
          </div>

          <div className="flex items-center gap-2">
            {recording.isRecording ? (
              <button
                onClick={() => void recording.stop()}
                disabled={isReplaying}
                className={`${toolbarButton} text-neutral-dark hover:bg-neutral-100`}
              >
                {t('testPage.stop')}
              </button>
            ) : (
              <button
                onClick={record}
                disabled={readOnly || busy || recordingDisabled}
                className={`${toolbarButton} text-red-600 hover:bg-red-50`}
              >
                {t('testPage.record')}
              </button>
            )}
            <button
              onClick={() => void recording.run()}
              disabled={busy || isRunning}
              className={`${toolbarButton} text-green-700 hover:bg-green-50`}
            >
              {t('testPage.run')}
            </button>
            <button
              onClick={() => setShowCode(!showCode)}
              aria-pressed={showCode}
              className={`${toolbarButton} ${showCode ? 'bg-neutral-lt' : ''} text-neutral-dk hover:bg-neutral-50`}
            >
              {t('testPage.code')}
            </button>
            <button
              onClick={() => setIsOutputVisible(!isOutputVisible)}
              aria-pressed={isOutputVisible}
              className={`${toolbarButton} ${isOutputVisible ? 'bg-neutral-lt' : ''} text-neutral-dk hover:bg-neutral-50`}
            >
              {t('testPage.lastRun')}
            </button>
            <Dropdown
              buttonText={t('testPage.more')}
              options={moreOptions}
              defaultOption={-1}
              disabled={busy}
            />
          </div>

          {browserOpen ? (
            <div className="flex-1 flex flex-row gap-4 min-h-[24rem]">
              <div className="w-[40%] min-h-0">
                <StyledPanel>{steps ?? <></>}</StyledPanel>
              </div>
              <div className="w-[60%] border border-neutral-bdr rounded-lg overflow-hidden bg-white relative">
                <RecordingBrowser
                  url={recording.recordingUrl}
                  preloadPath={recording.preloadPath}
                />
                {isReplaying && (
                  <div className="absolute inset-0 bg-amber-50/60 flex flex-col items-center justify-center gap-3 z-10">
                    <p className="text-sm font-medium text-amber-700">
                      {t('recorder.mainRecorderPanel.replaying')}
                    </p>
                    <button
                      onClick={() => void recording.cancelReplay()}
                      className="px-4 py-1.5 text-sm rounded border border-amber-400 bg-white text-amber-700 hover:bg-amber-50 font-medium"
                    >
                      {t('recorder.breakpoint.stopReplay')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-[12rem]">
              <StyledPanel>{steps ?? <></>}</StyledPanel>
            </div>
          )}

          {isOutputVisible && (
            <div className="h-48" data-testid="last-run">
              <StyledPanel>
                <OutputPanel output={runOutput} />
              </StyledPanel>
            </div>
          )}
        </>
      )}

      {recording.assertionInfo && (
        <AssertionTextModal
          initialText={recording.assertionInfo.text}
          assertionType={assertionModalType(recording.assertionInfo.pendingAssertion)}
          onSave={saveAssertion}
          onClose={() => recording.setAssertionInfo(null)}
        />
      )}
      {confirmingStartOver && (
        <ConfirmationModal
          title={t('testPage.startOver')}
          message={t('testPage.startOverConfirm')}
          onConfirm={startOver}
          onCancel={() => setConfirmingStartOver(false)}
        />
      )}
      {confirmingDelete && test && (
        <DeleteModal
          testName={test.name}
          onConfirm={deleteTest}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  )
}

/** The embedded website being recorded; registers itself with main once loaded. */
const RecordingBrowser: React.FC<{ url: string | null; preloadPath: string | null }> = ({
  url,
  preloadPath
}) => {
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  if (!url || !preloadPath) return null
  return (
    <webview
      ref={(el: HTMLElement | null) => {
        const wv = el as unknown as Electron.WebviewTag | null
        if (wv && wv !== webviewRef.current) {
          webviewRef.current = wv
          wv.addEventListener('dom-ready', () => {
            window.api.registerRecorderWebContents(wv.getWebContentsId())
          })
        }
      }}
      src={url}
      preload={`file://${preloadPath}`}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

export default TestPage
