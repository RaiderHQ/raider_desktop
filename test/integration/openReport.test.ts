import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const openPath = vi.fn()
vi.mock('electron', () => ({ shell: { openPath: (p: string): Promise<string> => openPath(p) } }))

import { openReport, reportExists } from '../../src/main/handlers/openReport'

describe('openReport handlers', () => {
  let project: string

  beforeEach(() => {
    vi.clearAllMocks()
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'raider-'))
  })

  const writeReport = (): string => {
    fs.mkdirSync(path.join(project, 'raider-results'))
    const file = path.join(project, 'raider-results', 'index.html')
    fs.writeFileSync(file, '<html></html>')
    return file
  }

  it('reports whether index.html exists', async () => {
    expect(await reportExists(project)).toBe(false)
    writeReport()
    expect(await reportExists(project)).toBe(true)
  })

  it('opens index.html with the default app', async () => {
    const file = writeReport()
    openPath.mockResolvedValue('')
    expect(await openReport(project)).toEqual({ success: true })
    expect(openPath).toHaveBeenCalledWith(file)
  })

  it('fails without opening anything when there is no report', async () => {
    const result = await openReport(project)
    expect(result.success).toBe(false)
    expect(result.error).toBe('No report yet — run the tests first')
    expect(openPath).not.toHaveBeenCalled()
  })

  it('returns the shell error when opening fails', async () => {
    writeReport()
    openPath.mockResolvedValue('No application knows how to open this file')
    expect(await openReport(project)).toEqual({
      success: false,
      error: 'No application knows how to open this file'
    })
  })

  it('rejects an empty project path', async () => {
    expect(await reportExists('')).toBe(false)
    expect((await openReport('')).success).toBe(false)
  })
})
