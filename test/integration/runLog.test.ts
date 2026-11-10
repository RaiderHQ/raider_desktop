import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { readRunLog } from '../../src/main/handlers/schedules/runLog'

let project: string
const jobDir = (name: string): string => join(project, '.raider', 'flows', name)
const writeLog = async (name: string, text: string): Promise<void> => {
  await mkdir(jobDir(name), { recursive: true })
  await writeFile(join(jobDir(name), 'runs.jsonl'), text)
}
const line = (n: number): string => JSON.stringify({ run_id: `r${n}`, status: 'completed' })

beforeEach(async () => {
  project = await realpath(await mkdtemp(join(tmpdir(), 'raider-runlog-')))
})

afterEach(async () => {
  await rm(project, { recursive: true, force: true })
})

describe('readRunLog', () => {
  it('reads each line of a good log, oldest first', async () => {
    await writeLog('fill_hours', `${line(1)}\n${line(2)}\n`)
    expect(await readRunLog(project, 'fill_hours')).toEqual([
      { run_id: 'r1', status: 'completed' },
      { run_id: 'r2', status: 'completed' }
    ])
  })

  it.each(['Fill_Hours', 'env', 'a b'])('reads nothing for the bad name %j', async (name) => {
    // A real, readable log sits where the bad name would resolve
    await writeLog(name, `${line(1)}\n`)
    expect(await readRunLog(project, name)).toEqual([])
  })

  it('reads nothing when the log is missing', async () => {
    expect(await readRunLog(project, 'fill_hours')).toEqual([])
  })

  it('refuses a symlinked runs.jsonl, even to a good log inside the project', async () => {
    const target = join(project, 'elsewhere.jsonl')
    await writeFile(target, `${line(1)}\n`)
    await mkdir(jobDir('fill_hours'), { recursive: true })
    await symlink(target, join(jobDir('fill_hours'), 'runs.jsonl'))
    expect(await readRunLog(project, 'fill_hours')).toEqual([])
  })

  it('skips a bad JSON line and keeps the rest', async () => {
    await writeLog('fill_hours', `${line(1)}\n{not json\n\n${line(2)}\n`)
    expect(await readRunLog(project, 'fill_hours')).toEqual([
      { run_id: 'r1', status: 'completed' },
      { run_id: 'r2', status: 'completed' }
    ])
  })

  it('reads only the tail of a long log and drops its partial first line', async () => {
    const text = `${line(1)}\n${line(2)}\n${line(3)}\n`
    await writeLog('fill_hours', text)
    // The cut lands inside line 2, so only line 3 is whole
    const maxBytes = line(3).length + 1 + Math.floor(line(2).length / 2)
    expect(await readRunLog(project, 'fill_hours', maxBytes)).toEqual([
      { run_id: 'r3', status: 'completed' }
    ])
  })
})
