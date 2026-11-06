import React, { SetStateAction, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { toRecordableUrl } from '@shared/recordUrl'
import CommandList from '@components/CommandList'
import OutputPanel from '@components/OutputPanel'
import StyledPanel from '@components/StyledPanel'
import Tooltip from '@components/Tooltip'
import Dropdown from '@components/Dropdown'
import DeleteModal from '@components/DeleteModal'
import ConfirmationModal from '@components/ConfirmationModal'
import CodeViewToggle from '@components/CodeViewToggle'
import AssertionTextModal from '@components/AssertionTextModal'
import RunPanel from '@components/RunPanel'
import FailedStepPanel from '@components/FailedStepPanel'
import EditValueForm from '@components/FailedStepPanel/EditValueForm'
import { removeStepWithUndo } from '@foundation/removeStepWithUndo'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { RecordingTarget } from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { buildAssertionStep, assertionModalType } from '@foundation/assertionStep'
import { handleSaveResult } from '@foundation/saveResult'
import { testKeyOf } from '@foundation/testKey'
import type { TestRow } from '@foundation/testKey'
import type { TestResult } from '@foundation/Types/testResult'
import type { Step } from '@shared/types/step'
import { UNLISTED_SUITE_ID } from '@shared/types/suite'
import { onMenuCommand } from '@foundation/menuCommands'
import { dropEmptyDraft, isEmptyRecording, useTestRecording } from '../../hooks/useTestRecording'
import { useFailedStep } from '../../hooks/useFailedStep'
import { useDocumentTitle } from '../../hooks/useDocumentTitle'
import NewTestForm from './NewTestForm'
import RecordingLayout from './RecordingLayout'

interface TestPageProps {
  /** The recorded test to show; without one, a new test is named, then recorded */
  row?: TestRow
  /** The suite a new test is saved into (the list's filter); outside any suite by default */
  targetSuiteId?: string
}

const field =
  'block w-full px-3 py-1 border border-neutral-bdr rounded text-sm focus:ring-ruby focus:border-ruby transition-colors disabled:bg-neutral-lt disabled:cursor-not-allowed'

const toolbarButton =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr font-medium transition-colors bg-white disabled:text-neutral-mid disabled:cursor-not-allowed'

/** A recorded test (or a new one): its name, start URL, steps, and what can be done with it. */
const TestPage: React.FC<TestPageProps> = ({ row, targetSuiteId = UNLISTED_SUITE_ID }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const recording = useTestRecording()
  const activeTest = useRecorderStore((s) => s.activeTest)
  const activeSuiteId = useRecorderStore((s) => s.activeSuiteId)
  const draftTest = useRecorderStore((s) => s.draftTest)
  const runActive = useRunStore((s) => s.isActive || s.checking)
  const recorderRunning = useRecorderStore((s) => s.isRunning)
  const runBusy = runActive || recorderRunning
  // Only this page's own run: Overview's panel already shows a run from elsewhere
  const ownRun = useRunStore(
    (s) => s.origin?.route === location.pathname || s.notReady?.origin.route === location.pathname
  )
  const showCode = useRecorderStore((s) => s.showCode)
  const isOutputVisible = useRecorderStore((s) => s.isOutputVisible)
  const breakpointIndex = useRecorderStore((s) => s.breakpointIndex)
  const isReplaying = useRecorderStore((s) => s.isReplayingToBreakpoint)
  // Re-picking a step's element: the recorder is open, but nothing is recorded
  const pickTarget = useRecorderStore((s) =>
    s.recordingTarget?.kind === 'pick' ? s.recordingTarget : null
  )
  const picking = pickTarget !== null
  const pickingStep = useRecorderStore((s) => s.pickingStep)
  const recordingDisabled = useProjectStore((s) => s.layout?.recordable === false)
  // Only a mobile project says why Record is off, for now
  const mobileProject = useProjectStore((s) => s.layout?.unsupportedReason === 'mobile')
  const recordingDisabledReason = mobileProject ? t('recorder.unsupported.mobile') : undefined
  const runOutput = useRunOutputStore((s) => s.runOutput)
  // Output of a run on the old suite format; live runs show in the run panel instead
  const hasLegacyOutput = runOutput !== ''
  const projectPath = useProjectStore((s) => s.projectPath)
  const { updateActiveTest, setShowCode, setIsOutputVisible, setBreakpointIndex } =
    useRecorderStore.getState()

  // Leaving a new test nobody recorded anything in forgets it. Deferred so a remount
  // (React StrictMode in dev) keeps it
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return (): void => {
      mounted.current = false
      setTimeout(() => {
        if (!mounted.current) dropEmptyDraft()
      }, 0)
    }
  }, [])

  const draftTarget: RecordingTarget = { kind: 'draft', suiteId: targetSuiteId }
  const key = row ? testKeyOf(row) : null
  const [openFailed, setOpenFailed] = useState(false)
  useEffect(() => {
    let current = true
    setOpenFailed(false)
    if (!row) return
    dropEmptyDraft()
    // A recording (or replay) belongs to the test it started on: save it before opening this one
    const { recordingTarget, isRecording, isReplayingToBreakpoint } = useRecorderStore.getState()
    if (recordingTarget || isRecording || isReplayingToBreakpoint) {
      recording
        .leave()
        .catch((error: unknown) => console.error('Saving the recording failed:', error))
    }
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
    // A project that moved (Save project to…) forgets its open test: open it again
  }, [key, projectPath])

  const isDraft = !row
  const test = row
    ? activeTest && activeTest.id === row.testId
      ? activeTest
      : null
    : activeTest && draftTest && activeTest.id === draftTest.id
      ? activeTest
      : null
  const target: RecordingTarget = isDraft ? draftTarget : { kind: 'test' }
  const readOnly = !!test?.ownership && test.ownership !== 'recorded'
  const busy = recording.isRecording || isReplaying || picking
  const failedStep = useFailedStep(projectPath, test)
  // Edited while recording, and while a draft holds steps Stop & save has not written yet
  // (a draft with only its start page is one Stop & save would drop, so it is not)
  const draftHasSteps = isDraft && !!test && !isEmptyRecording(test)
  useDocumentTitle(test?.name ?? null, recording.isRecording || draftHasSteps)

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
    // A new test is saved, under its latest name, when its recording stops
    if (isDraft) return
    // Saved right away, not left to the debounce: opening another test cancels that timer
    const renamed = { ...test, name }
    if (activeSuiteId) {
      Promise.resolve(window.api.saveRecording(activeSuiteId, renamed))
        .then((result) => handleSaveResult(result, renamed.id, t))
        .catch((error: unknown) => console.error('Saving the new name failed:', error))
    }
  }

  // The failed step's value being corrected; and the result it was corrected for
  const [editingValue, setEditingValue] = useState(false)
  const [fixedFor, setFixedFor] = useState<TestResult | null>(null)
  // The step (1-based) a replay for Re-pick couldn't get past
  const [replayFailedStep, setReplayFailedStep] = useState<number | null>(null)
  const failedIndex = failedStep.status === 'mapped' ? failedStep.index : null
  useEffect(() => {
    setEditingValue(false)
    setReplayFailedStep(null)
  }, [test?.id, failedIndex])
  const fixed = failedStep.status !== 'none' && failedStep.result === fixedFor

  const saveFixedStep = (updated: Step, result: TestResult): void => {
    if (!test || !activeSuiteId) return
    updateActiveTest((p) =>
      p ? { ...p, steps: p.steps.map((s) => (s.id === updated.id ? updated : s)) } : null
    )
    setEditingValue(false)
    // The latest steps, which may have changed since this render
    const fixedTest = useRecorderStore.getState().activeTest
    if (!fixedTest || fixedTest.id !== test.id) return
    // Saved once, right away, as a re-pick is: the next run reads the file
    recording
      .saveFixedTest(activeSuiteId, fixedTest)
      .then((saved) => {
        if (saved) setFixedFor(result)
      })
      .catch((error: unknown) => console.error('Saving the fix failed:', error))
  }

  const rePick = (index: number, result: TestResult): void => {
    setReplayFailedStep(null)
    recording
      .rePick(index)
      .then((outcome) => {
        if (outcome.kind === 'picked') setFixedFor(result)
        if (outcome.kind === 'replayFailed') setReplayFailedStep(outcome.stepNumber)
      })
      .catch((error: unknown) => console.error('Picking the element failed:', error))
  }

  // Esc cancels a pick from the app window too, not only from the page being picked on
  useEffect((): (() => void) | void => {
    if (!picking) return
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') void recording.cancelPick()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [picking])

  // The step (0-based) to re-record from, while the confirmation is open
  const [reRecordingFrom, setReRecordingFrom] = useState<number | null>(null)
  const reRecordFrom = (index: number): void => {
    setReRecordingFrom(null)
    setReplayFailedStep(null)
    // Steps before it are kept and replayed; the first step has nothing before it
    const started =
      index === 0 ? recording.start(target) : recording.recordFromHere(index - 1, target)
    started.catch((error: unknown) => console.error('Recording failed:', error))
  }

  const [confirmingStartOver, setConfirmingStartOver] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const record = (): void => {
    if (!test) return
    const action = test.steps.length > 0 ? recording.continueRecording : recording.start
    action(target).catch((error: unknown) => console.error('Recording failed:', error))
  }

  // The editor's back button comes back to this test
  const editCode = (): void => {
    if (!projectPath || !test?.file) return
    navigate('/file-editor', {
      state: {
        fileName: test.file.split('/').pop() ?? test.file,
        filePath: `${projectPath}/${test.file}`,
        returnTo: location.pathname
      }
    })
  }

  // The menu bar's Test › Record and Run act like the toolbar buttons, under the same rules
  // A confirmation on top of the page blocks the buttons; it must block the menu too
  const confirming = confirmingDelete || confirmingStartOver || reRecordingFrom !== null
  // recordingTarget covers the moment between pressing Record and the recorder starting
  const starting = useRecorderStore((s) => s.recordingTarget !== null)
  const canRecord = !!test && !readOnly && !busy && !starting && !recordingDisabled && !confirming
  const canRun = !!test && !busy && !starting && !runBusy && !isDraft && !confirming
  useEffect(
    () =>
      onMenuCommand((command) => {
        if (command === 'record' && canRecord) record()
        if (command === 'run' && canRun) void recording.run()
        // Stop & save is the Stop button; Open file… is the toolbar's, which the recording blocks
        if (command === 'stop' && recording.isRecording && !isReplaying) void recording.stop()
        if (command === 'open-file' && !busy && !starting && !confirming && !!test?.file) {
          editCode()
        }
        // Everything else is saved as it changes; only a recording waits for Stop & save,
        // and a draft whose Stop & save failed is written again (the close dialog's Save)
        if (command !== 'save' || isReplaying) return
        if (recording.isRecording) void recording.stop()
        else if (draftHasSteps) void recording.saveDraft(targetSuiteId)
      }),
    [
      canRecord,
      canRun,
      record,
      recording.run,
      recording.isRecording,
      recording.stop,
      recording.saveDraft,
      busy,
      isReplaying,
      starting,
      confirming,
      test?.file,
      editCode,
      draftHasSteps,
      targetSuiteId
    ]
  )

  const startOver = (): void => {
    setConfirmingStartOver(false)
    recording.start(target).catch((error: unknown) => console.error('Recording failed:', error))
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

  const startDraft = (name: string, url: string): void => {
    // A bad address keeps the form: no draft is made that can't record (D8)
    if (url.trim() !== '' && !toRecordableUrl(url)) {
      toast.error(t('recorder.unsupportedUrl'))
      return
    }
    useRecorderStore.getState().startDraft(name, url)
    recording
      .start(draftTarget)
      .catch((error: unknown) => console.error('Recording failed:', error))
  }

  // Quick record made the draft elsewhere and asked for the recorder to start on arrival
  const hasTest = !!test
  useEffect(() => {
    // The flag is read from the store and consumed here, so a re-render can't start twice
    const store = useRecorderStore.getState()
    if (!isDraft || !hasTest || !store.recordOnOpen) return
    store.setRecordOnOpen(false)
    // A fresh target object per run: a start the rehearsal mount abandoned sees the next
    // run's target in the store and stops itself before it reaches main
    recording
      .start({ ...draftTarget })
      .catch((error: unknown) => console.error('Recording failed:', error))
    return (): void => {
      // Gone before the recorder got going (StrictMode's rehearsal mount, or a quick leave):
      // the hook's own cleanup has already abandoned the start, so ask again next time
      const { isRecording, recordingTarget } = useRecorderStore.getState()
      if (!isRecording && !recordingTarget) useRecorderStore.getState().setRecordOnOpen(true)
    }
  }, [isDraft, hasTest])

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
      onDeleteStep={(index) => removeStepWithUndo(updateActiveTest, index)}
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
          .recordFromHere(index, target)
          .catch((error: unknown) => console.error('Recording failed:', error))
      }
      readOnly={readOnly}
      markLatest={recording.isRecording}
      failedIndex={failedIndex}
      belowStep={(index) =>
        editingValue && failedStep.status === 'mapped' && index === failedStep.index ? (
          <EditValueForm
            step={failedStep.step}
            actualValue={failedStep.reason.actualValue}
            onSave={(updated) => saveFixedStep(updated, failedStep.result)}
            onCancel={() => setEditingValue(false)}
          />
        ) : null
      }
    />
  ) : null

  const browserOpen = (recording.recordingUrl && recording.preloadPath) || isReplaying

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <nav aria-label={t('testPage.breadcrumb')} className="flex items-center gap-1.5 text-sm">
        <Link to="/overview/tests" className="text-neutral-md hover:text-neutral-dark">
          {t('testPage.breadcrumbRoot')}
        </Link>
        <span className="text-neutral-md">/</span>
        <span className="font-semibold text-neutral-dark truncate">
          {test?.name ?? row?.name ?? t('tests.newTest')}
        </span>
      </nav>

      {openFailed ? (
        <p className="text-sm text-neutral-md">{t('tests.actionFailed')}</p>
      ) : !test ? (
        isDraft && (
          <NewTestForm
            onStart={startDraft}
            onCancel={() => navigate('/overview/tests')}
            disabled={recordingDisabled}
            disabledReason={recordingDisabledReason}
          />
        )
      ) : (
        <>
          <div className="flex items-center gap-4">
            <Tooltip content={t('tooltips.testPage.name')} position="bottom" className="flex-1">
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
            </Tooltip>
            <Tooltip content={t('tooltips.testPage.url')} position="bottom" className="flex-1">
              <input
                type="text"
                className={field}
                value={test.url ?? ''}
                onChange={(e) =>
                  updateActiveTest((p) => (p ? { ...p, url: e.target.value } : null))
                }
                placeholder={t('testPage.url')}
                aria-label={t('testPage.url')}
                disabled={readOnly}
              />
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            {recording.isRecording && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" aria-hidden />
                {t('testPage.recording')}
              </span>
            )}
            {recording.isRecording ? (
              <Tooltip content={t('tooltips.testPage.stop')} shortcut="stop" position="bottom">
                <button
                  onClick={() => void recording.stop()}
                  disabled={isReplaying}
                  className={`${toolbarButton} text-neutral-dark hover:bg-neutral-100`}
                >
                  {t('testPage.stop')}
                </button>
              </Tooltip>
            ) : (
              <Tooltip
                content={t('tooltips.testPage.record')}
                shortcut="record"
                disabledReason={recordingDisabledReason}
                position="bottom"
              >
                <button
                  onClick={record}
                  disabled={readOnly || busy || recordingDisabled}
                  title={recordingDisabledReason}
                  className={`${toolbarButton} text-red-600 hover:bg-red-50`}
                >
                  {t('testPage.record')}
                </button>
              </Tooltip>
            )}
            <Tooltip
              content={t('tooltips.testPage.run')}
              shortcut="run"
              disabledReason={isDraft ? t('run.saveToRun') : undefined}
              position="bottom"
            >
              <button
                onClick={() => void recording.run()}
                disabled={busy || runBusy || isDraft}
                title={isDraft ? t('run.saveToRun') : undefined}
                className={`${toolbarButton} text-green-700 hover:bg-green-50`}
              >
                {t('testPage.run')}
              </button>
            </Tooltip>
            {/* A test from before project files has no file to edit */}
            {test.file && projectPath && (
              <Tooltip
                content={t('tooltips.testPage.openFile')}
                shortcut="open-file"
                position="bottom"
              >
                <button
                  onClick={editCode}
                  disabled={busy}
                  className={`${toolbarButton} text-neutral-dk hover:bg-neutral-50`}
                >
                  {t('testPage.editCode')}
                </button>
              </Tooltip>
            )}
            <CodeViewToggle
              view={showCode ? 'ruby' : 'steps'}
              onChange={(view) => setShowCode(view === 'ruby')}
            />
            {hasLegacyOutput && (
              <Tooltip content={t('tooltips.testPage.lastRun')} position="bottom">
                <button
                  onClick={() => setIsOutputVisible(!isOutputVisible)}
                  aria-pressed={isOutputVisible}
                  className={`${toolbarButton} ${isOutputVisible ? 'bg-neutral-lt' : ''} text-neutral-dk hover:bg-neutral-50`}
                >
                  {t('testPage.lastRun')}
                </button>
              </Tooltip>
            )}
            {!isDraft && (
              <Tooltip content={t('tooltips.testPage.more')} position="bottom">
                <Dropdown
                  buttonText={t('testPage.more')}
                  options={moreOptions}
                  defaultOption={-1}
                  disabled={busy}
                />
              </Tooltip>
            )}
          </div>

          {failedStep.status !== 'none' && projectPath && !picking && (
            <FailedStepPanel
              state={failedStep}
              test={test}
              projectPath={projectPath}
              readOnly={readOnly}
              actions={null}
              onRePick={
                recordingDisabled || failedStep.status !== 'mapped'
                  ? undefined
                  : () => rePick(failedStep.index, failedStep.result)
              }
              replayFailedStep={replayFailedStep}
              onEditValue={() => setEditingValue(true)}
              onReRecord={recordingDisabled ? undefined : setReRecordingFrom}
              fixed={fixed}
              onRunAgain={() => void recording.run()}
            />
          )}

          {pickTarget && (
            <div
              role="status"
              className="flex items-center gap-3 text-sm font-medium px-3 py-2 rounded border border-neutral-bdr bg-neutral-50 text-neutral-dark"
            >
              <span className="flex-1">
                {pickingStep !== null
                  ? t('failedStep.pickBanner', { n: pickingStep })
                  : t('failedStep.pickLoading', {
                      n: test.steps.findIndex((s) => s.id === pickTarget.stepId) + 1
                    })}
              </span>
              <Tooltip content={t('tooltips.testPage.cancelPick')} position="bottom">
                <button
                  type="button"
                  onClick={() => void recording.cancelPick()}
                  className={`${toolbarButton} text-neutral-dark hover:bg-neutral-100`}
                >
                  {t('common.cancel')}
                </button>
              </Tooltip>
            </div>
          )}

          {browserOpen ? (
            <RecordingLayout
              steps={steps}
              recording={recording}
              isReplaying={isReplaying}
              focusBrowser={pickingStep !== null}
            />
          ) : (
            <>
              <div className="flex-1 min-h-[12rem]">
                <StyledPanel>{steps ?? <></>}</StyledPanel>
              </div>
              {!isDraft && !recording.isRecording && !readOnly && (
                <p className="text-xs text-neutral-md mt-2">{t('testPage.autosaved')}</p>
              )}
            </>
          )}

          {ownRun && (
            <RunPanel routeKey={location.pathname} onRunAgain={() => void recording.run()} />
          )}

          {isOutputVisible && hasLegacyOutput && (
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
      {reRecordingFrom !== null && test && (
        <ConfirmationModal
          title={t('failedStep.reRecordConfirmTitle', { n: reRecordingFrom + 1 })}
          message={t('failedStep.reRecordConfirmBody', {
            n: reRecordingFrom + 1,
            last: test.steps.length
          })}
          onConfirm={() => reRecordFrom(reRecordingFrom)}
          onCancel={() => setReRecordingFrom(null)}
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

export default TestPage
