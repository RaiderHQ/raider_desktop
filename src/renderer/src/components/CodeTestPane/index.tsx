import React, { SetStateAction, useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import CommandList from '@components/CommandList'
import ConfirmationModal from '@components/ConfirmationModal'
import StyledPanel from '@components/StyledPanel'
import AssertionTextModal from '@components/AssertionTextModal'
import RunPanel from '@components/RunPanel'
import RecordingLayout from '@components/TestPage/RecordingLayout'
import useRecorderStore from '@foundation/Stores/recorderStore'
import useProjectStore from '@foundation/Stores/projectStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { buildAssertionStep, assertionModalType } from '@foundation/assertionStep'
import type { TestRow } from '@foundation/testKey'
import type { CodeTestView } from '@shared/types/projectTest'
import type { Step } from '@shared/types/step'
import { useTestRecording } from '../../hooks/useTestRecording'

interface CodeTestPaneProps {
  /** A test edited in code ('code' or 'codeOwnedWasRecorded'): a project file */
  row: TestRow
}

const toolbarButton =
  'text-xs px-2.5 py-1 rounded border border-neutral-bdr font-medium transition-colors bg-white disabled:text-neutral-mid disabled:cursor-not-allowed'

/**
 * A test file edited in code: its tests (examples), one shown at a time as steps or
 * code. It can be run, opened in the code editor, or one of its tests recorded over.
 */
const CodeTestPane: React.FC<CodeTestPaneProps> = ({ row }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const recording = useTestRecording()
  const activeTest = useRecorderStore((s) => s.activeTest)
  const recordingTarget = useRecorderStore((s) => s.recordingTarget)
  const unsavedExample = useRecorderStore((s) => s.unsavedExample)
  const runActive = useRunStore((s) => s.isActive || s.checking)
  const recorderRunning = useRecorderStore((s) => s.isRunning)
  const runBusy = runActive || recorderRunning
  // Only this page's own run: Overview's panel already shows a run from elsewhere
  const ownRun = useRunStore(
    (s) => s.origin?.route === location.pathname || s.notReady?.origin.route === location.pathname
  )
  const showCode = useRecorderStore((s) => s.showCode)
  const isReplaying = useRecorderStore((s) => s.isReplayingToBreakpoint)
  const recordingDisabled = useProjectStore((s) => s.layout?.recordable === false)
  // Only a mobile project says why Record is off, for now
  const mobileProject = useProjectStore((s) => s.layout?.unsupportedReason === 'mobile')
  const recordingDisabledReason = mobileProject ? t('recorder.unsupported.mobile') : undefined
  const projectPath = useProjectStore((s) => s.projectPath)
  const { updateActiveTest, setShowCode } = useRecorderStore.getState()
  const file = row.file ?? ''

  const [view, setView] = useState<CodeTestView | null>(null)
  const [openFailed, setOpenFailed] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [confirmingRecord, setConfirmingRecord] = useState(false)
  // A test edited in code is shown as its code; its steps only on request
  const [showSteps, setShowSteps] = useState(false)

  const load = useCallback((): (() => void) => {
    let current = true
    setOpenFailed(false)
    Promise.resolve(window.api.openCodeTest(file))
      .then((opened) => {
        if (current) setView(opened)
      })
      .catch((error: unknown) => {
        console.error('Opening the test failed:', error)
        if (current) setOpenFailed(true)
      })
    return (): void => {
      current = false
    }
  }, [file])
  useEffect(load, [load])

  const selected =
    view?.examples.find((example) => example.name === selectedName) ?? view?.examples[0] ?? null
  const recordingExample = recordingTarget?.kind === 'example'
  const busy = recording.isRecording || isReplaying || recordingExample
  // The steps of the recording (live, or not saved into the file)
  const recordedTest =
    activeTest && (recordingExample || unsavedExample?.testId === activeTest.id) ? activeTest : null
  // Steps can stand in for the code only when Raider understood every line of it
  const stepsMatchFile = !!selected && selected.steps.every((step) => step.kind !== 'custom')
  const exampleAsCode = !(showSteps && stepsMatchFile)

  const run = (): void => {
    void useRunStore
      .getState()
      .start({ kind: 'files', files: [file] }, { route: location.pathname, label: row.name })
  }

  const editCode = (): void => {
    if (!projectPath) return
    // The editor's back button comes back to this test
    navigate('/file-editor', {
      state: {
        fileName: file.split('/').pop() ?? file,
        filePath: `${projectPath}/${file}`,
        returnTo: location.pathname
      }
    })
  }

  const record = (): void => {
    setConfirmingRecord(false)
    if (!selected) return
    recording
      .start({ kind: 'example', file, exampleName: selected.name })
      .catch((error: unknown) => console.error('Recording failed:', error))
  }

  const stop = async (): Promise<void> => {
    await recording.stop()
    // Written into the file: show what it holds now
    if (!useRecorderStore.getState().unsavedExample) load()
  }

  const saveAssertion = (expectedText: string): void => {
    const info = recording.assertionInfo
    if (info) {
      const step = buildAssertionStep(info.pendingAssertion, info.element, expectedText)
      updateActiveTest((p) => (p ? { ...p, steps: [...p.steps, step] } : null))
    }
    recording.setAssertionInfo(null)
  }

  const recordedSteps = recordedTest ? (
    <CommandList
      steps={recordedTest.steps}
      setSteps={(next: SetStateAction<Step[]>) =>
        updateActiveTest((p) =>
          p ? { ...p, steps: typeof next === 'function' ? next(p.steps) : next } : null
        )
      }
      onDeleteStep={(index) =>
        updateActiveTest((p) => (p ? { ...p, steps: p.steps.filter((_, i) => i !== index) } : null))
      }
      showCode={showCode}
      markLatest={recording.isRecording}
    />
  ) : null

  const browserOpen = (recording.recordingUrl && recording.preloadPath) || isReplaying
  // Code switches the recording's steps while one is shown, else the selected test's view
  const showingRecording = !!browserOpen || !!(recordedTest && unsavedExample)
  const codePressed = showingRecording ? showCode : exampleAsCode
  const toggleCode = (): void =>
    showingRecording ? setShowCode(!showCode) : setShowSteps(exampleAsCode)

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <nav aria-label={t('testPage.breadcrumb')} className="flex items-center gap-1.5 text-sm">
        <Link to="/overview/tests" className="text-neutral-mid hover:text-neutral-dark">
          {t('testPage.breadcrumbRoot')}
        </Link>
        <span className="text-neutral-mid">/</span>
        <span className="font-semibold text-neutral-dark truncate">{row.name}</span>
      </nav>

      {openFailed ? (
        <p className="text-sm text-neutral-mid">{t('tests.actionFailed')}</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {recording.isRecording && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" aria-hidden />
                {t('testPage.recording')}
              </span>
            )}
            {recording.isRecording ? (
              <button
                onClick={() => void stop()}
                disabled={isReplaying}
                className={`${toolbarButton} text-neutral-dark hover:bg-neutral-100`}
              >
                {t('testPage.stop')}
              </button>
            ) : (
              <button
                onClick={() => setConfirmingRecord(true)}
                // Not over steps that aren't saved yet: they'd be lost
                disabled={!selected || busy || recordingDisabled || !!recordedTest}
                title={recordingDisabledReason}
                className={`${toolbarButton} text-red-600 hover:bg-red-50`}
              >
                {t('testPage.record')}
              </button>
            )}
            <button
              onClick={run}
              disabled={busy || runBusy || !file}
              className={`${toolbarButton} text-green-700 hover:bg-green-50`}
            >
              {t('testPage.run')}
            </button>
            <button
              onClick={editCode}
              // Not away from steps that aren't saved yet
              disabled={busy || !file || !projectPath || !!recordedTest}
              className={`${toolbarButton} text-neutral-dk hover:bg-neutral-50`}
            >
              {t('testPage.editCode')}
            </button>
            <button
              onClick={toggleCode}
              aria-pressed={codePressed}
              // No steps view for code Raider can't show as steps
              disabled={!showingRecording && !stepsMatchFile}
              className={`${toolbarButton} ${codePressed ? 'bg-neutral-lt' : ''} text-neutral-dk hover:bg-neutral-50`}
            >
              {t('testPage.code')}
            </button>
          </div>

          {browserOpen ? (
            <RecordingLayout
              steps={recordedSteps}
              recording={recording}
              isReplaying={isReplaying}
            />
          ) : recordedTest && unsavedExample ? (
            <div className="flex-1 min-h-[12rem] flex flex-col gap-2">
              <div className="flex items-center gap-3 text-sm">
                {unsavedExample.reason === 'notUnique' && (
                  <p className="text-neutral-dark">
                    {t('testPage.exampleNotUnique', { name: unsavedExample.exampleName })}
                  </p>
                )}
                <button
                  onClick={() => void recording.saveAsNewTest()}
                  className={`${toolbarButton} text-neutral-dark hover:bg-neutral-100`}
                >
                  {t('testPage.saveAsNew')}
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <StyledPanel>{recordedSteps ?? <></>}</StyledPanel>
              </div>
            </div>
          ) : (
            view && (
              <div className="flex-1 min-h-[12rem] flex flex-row gap-4">
                {/* Narrow windows keep room for the code beside the list */}
                <ul
                  aria-label={t('testPage.examples')}
                  className="w-56 max-w-[40%] shrink-0 space-y-1"
                >
                  {view.examples.map((example, index) => (
                    <li key={`${index}-${example.name}`}>
                      <button
                        onClick={() => setSelectedName(example.name)}
                        aria-pressed={example === selected}
                        className={`w-full text-left text-sm px-2 py-1 rounded transition-colors ${
                          example === selected
                            ? 'bg-neutral-lt font-semibold text-neutral-dark'
                            : 'text-neutral-dk hover:bg-neutral-50'
                        }`}
                      >
                        {example.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex-1 min-w-0">
                  <StyledPanel>
                    {selected ? (
                      <CommandList
                        steps={selected.steps}
                        setSteps={() => {}}
                        onDeleteStep={() => {}}
                        showCode={exampleAsCode}
                        readOnly
                      />
                    ) : (
                      <></>
                    )}
                  </StyledPanel>
                </div>
              </div>
            )
          )}

          {ownRun && <RunPanel routeKey={location.pathname} onRunAgain={run} />}
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
      {confirmingRecord && (
        <ConfirmationModal
          title={t('testPage.record')}
          subject={
            selected ? t('testPage.overwriteTarget', { name: selected.name, file }) : undefined
          }
          message={t('testPage.overwriteConfirm')}
          onConfirm={record}
          onCancel={() => setConfirmingRecord(false)}
        />
      )}
    </div>
  )
}

export default CodeTestPane
