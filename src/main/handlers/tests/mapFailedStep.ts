import { realpath } from 'fs/promises'
import { isAbsolute, relative, resolve } from 'path'
import { safeError } from '../../utils/safeLog'
import { appState } from '../appState'
import { activeProject } from '../mobile/deviceSettingsIpc'
import { findSidecarById, stepLinesFor } from './recordedTests'
import { parseFrame } from '@shared/stackFrames'
import type { FailedStepMap, FailedStepQuery } from '@shared/types/failedStep'

const NOT_RECORDED: FailedStepMap = { none: 'notRecorded' }

const stripDot = (path: string): string => path.replace(/^\.\//, '')

function isQuery(value: unknown): value is FailedStepQuery {
  const q = value as FailedStepQuery | null
  return (
    typeof q === 'object' &&
    q !== null &&
    typeof q.file === 'string' &&
    Array.isArray(q.backtrace) &&
    q.backtrace.every((l) => typeof l === 'string') &&
    (q.appFrame === undefined || typeof q.appFrame === 'string') &&
    (q.finishedAt === undefined || typeof q.finishedAt === 'string')
  )
}

/** The frame's path as the project-relative spec path, or null when it lies outside the project. */
async function projectRelative(file: string, projectPath: string): Promise<string | null> {
  let path = stripDot(file.replace(/\\/g, '/'))
  if (isAbsolute(path)) {
    const bases = [resolve(projectPath)]
    const real = await realpath(projectPath).catch(() => null)
    if (real) bases.push(real)
    const inside = bases
      .map((b) => relative(b, path).replace(/\\/g, '/'))
      .find((r) => !r.startsWith('..'))
    if (inside === undefined) return null
    path = inside
  }
  return path.startsWith('..') ? null : path
}

async function lineOfFirstFrameIn(
  file: string,
  frames: string[],
  projectPath: string
): Promise<number | null> {
  for (const text of frames) {
    const frame = parseFrame(text)
    if (frame && (await projectRelative(frame.file, projectPath)) === file) return frame.line
  }
  return null
}

/** 'map-failed-step': the recorded step a failed row's frames point into, or why none. */
export async function mapFailedStepHandler(
  projectPath: unknown,
  testId: unknown,
  failure: unknown
): Promise<FailedStepMap> {
  try {
    const project = await activeProject(projectPath)
    const { layout } = appState
    if (!project || !layout || typeof testId !== 'string' || !isQuery(failure)) return NOT_RECORDED

    const recorded = await findSidecarById(project, testId)
    if (!recorded || stripDot(failure.file) !== recorded.file) return NOT_RECORDED

    const found = await stepLinesFor(project, layout, testId)
    if ('none' in found) return found
    const { sidecar, stepLines } = found

    const ran = failure.finishedAt === undefined ? NaN : Date.parse(failure.finishedAt)
    if (!Number.isNaN(ran) && ran <= Date.parse(sidecar.updatedAt)) {
      return { none: 'changedSinceRun' }
    }
    if (!stepLines) return { none: 'noMap' }

    const frames = failure.appFrame ? [...failure.backtrace, failure.appFrame] : failure.backtrace
    const line = await lineOfFirstFrameIn(sidecar.file, frames, project)
    const range =
      line === null ? undefined : stepLines.ranges.find((r) => line >= r.start && line <= r.end)
    if (!range) return { none: 'outsideSteps' }
    const index = sidecar.steps.findIndex((s) => s.id === range.stepId)
    return index === -1 ? { none: 'noMap' } : { stepId: range.stepId, index }
  } catch (error) {
    safeError('Could not map the failure to a step:', error)
    return { none: 'noMap' }
  }
}
