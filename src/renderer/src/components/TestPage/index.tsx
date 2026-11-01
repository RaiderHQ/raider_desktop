import React, { SetStateAction, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import CommandList from '@components/CommandList'
import OutputPanel from '@components/OutputPanel'
import StyledPanel from '@components/StyledPanel'
import Dropdown from '@components/Dropdown'
import DeleteModal from '@components/DeleteModal'
import ConfirmationModal from '@components/ConfirmationModal'
import AssertionTextModal from '@components/AssertionTextModal'
import RunPanel from '@components/RunPanel'
import useRecorderStore from '@foundation/Stores/recorderStore'
import type { RecordingTarget } from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import useRunOutputStore from '@foundation/Stores/runOutputStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { buildAssertionStep, assertionModalType } from '@foundation/assertionStep'
import { handleSaveResult } from '@foundation/saveResult'
import { testKeyOf } from '@foundation/testKey'
import type { TestRow } from '@foundation/testKey'
import type { Step } from '@shared/types/step'
import { UNLISTED_SUITE_ID } from '@shared/types/suite'
import { dropEmptyDraft, useTestRecording } from '../../hooks/useTestRecording'
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
  const runActive = useRunStore((s) => s.isActive)
  const recorderRunning = useRecorderStore((s) => s.isRunning)
  const runBusy = runActive || recorderRunning
  // Only this page's own run: Overview's panel already shows a run from elsewhere
  const ownRun = useRunStore((s) => s.origin?.route === location.pathname)
  const showCode = useRecorderStore((s) => s.showCode)
  const isOutputVisible = useRecorderStore((s) => s.isOutputVisible)
  const breakpointIndex = useRecorderStore((s) => s.breakpointIndex)
  const isReplaying = useRecorderStore((s) => s.isReplayingToBreakpoint)
  const recordingDisabled = useProjectStore((s) => s.layout?.recordable === false)
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

  const [confirmingStartOver, setConfirmingStartOver] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const record = (): void => {
    if (!test) return
    const action = test.steps.length > 0 ? recording.continueRecording : recording.start
    action(target).catch((error: unknown) => console.error('Recording failed:', error))
  }

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
    useRecorderStore.getState().startDraft(name, url)
    recording
      .start(draftTarget)
      .catch((error: unknown) => console.error('Recording failed:', error))
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
          .recordFromHere(index, target)
          .catch((error: unknown) => console.error('Recording failed:', error))
      }
      readOnly={readOnly}
      markLatest={recording.isRecording}
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
        <span className="font-semibold text-neutral-dark truncate">
          {test?.name ?? row?.name ?? t('tests.newTest')}
        </span>
      </nav>

      {openFailed ? (
        <p className="text-sm text-neutral-mid">{t('tests.actionFailed')}</p>
      ) : !test ? (
        isDraft && (
          <NewTestForm
            onStart={startDraft}
            onCancel={() => navigate('/overview/tests')}
            disabled={recordingDisabled}
          />
        )
      ) : (
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
            {recording.isRecording && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" aria-hidden />
                {t('testPage.recording')}
              </span>
            )}
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
              disabled={busy || runBusy || isDraft}
              title={isDraft ? t('run.saveToRun') : undefined}
              className={`${toolbarButton} text-green-700 hover:bg-green-50`}
            >
              {t('testPage.run')}
            </button>
            {/* A test from before project files has no file to edit */}
            {test.file && projectPath && (
              <button
                onClick={editCode}
                disabled={busy}
                className={`${toolbarButton} text-neutral-dk hover:bg-neutral-50`}
              >
                {t('testPage.editCode')}
              </button>
            )}
            <button
              onClick={() => setShowCode(!showCode)}
              aria-pressed={showCode}
              className={`${toolbarButton} ${showCode ? 'bg-neutral-lt' : ''} text-neutral-dk hover:bg-neutral-50`}
            >
              {t('testPage.code')}
            </button>
            {hasLegacyOutput && (
              <button
                onClick={() => setIsOutputVisible(!isOutputVisible)}
                aria-pressed={isOutputVisible}
                className={`${toolbarButton} ${isOutputVisible ? 'bg-neutral-lt' : ''} text-neutral-dk hover:bg-neutral-50`}
              >
                {t('testPage.lastRun')}
              </button>
            )}
            {!isDraft && (
              <Dropdown
                buttonText={t('testPage.more')}
                options={moreOptions}
                defaultOption={-1}
                disabled={busy}
              />
            )}
          </div>

          {browserOpen ? (
            <RecordingLayout steps={steps} recording={recording} isReplaying={isReplaying} />
          ) : (
            <div className="flex-1 min-h-[12rem]">
              <StyledPanel>{steps ?? <></>}</StyledPanel>
            </div>
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
