// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import crypto from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

vi.mock('electron', () => ({
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  dialog: { showMessageBox: vi.fn() },
  app: { getPath: vi.fn(() => '') }
}))

import { acceptBaseline } from '../../src/main/handlers/results/acceptBaseline'
import { appState } from '../../src/main/handlers/appState'

const PNG_A = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5])
const PNG_B = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 9, 9])
const OK_BASELINE = 'screenshots/baselines/chrome/home.png'

let root: string
let actual: string
let confirm: ReturnType<typeof vi.fn>

const hashAll = (dir: string): Record<string, string> => {
  const out: Record<string, string> = {}
  const walk = (d: string): void => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name)
      const st = fs.lstatSync(full)
      if (st.isDirectory()) walk(full)
      else if (st.isSymbolicLink()) out[path.relative(dir, full)] = 'link:' + fs.readlinkSync(full)
      else
        out[path.relative(dir, full)] = crypto
          .createHash('sha256')
          .update(fs.readFileSync(full))
          .digest('hex')
    }
  }
  walk(dir)
  return out
}

const tmpFiles = (dir: string): string[] => {
  const found: string[] = []
  const walk = (d: string): void => {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name)
      if (fs.lstatSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.tmp')) found.push(full)
    }
  }
  walk(dir)
  return found
}

// Every file except `allowed` has the same hash as before (allowed may be new).
const expectOnlyChanged = (before: Record<string, string>, allowed: string[]): void => {
  const after = hashAll(root)
  for (const key of Object.keys(before)) {
    if (!allowed.includes(key)) expect(after[key]).toBe(before[key])
  }
  for (const key of Object.keys(after)) {
    if (!allowed.includes(key)) expect(before[key]).toBe(after[key])
  }
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'accept-baseline-'))
  fs.mkdirSync(path.join(root, 'raider-results', 'attachments'), { recursive: true })
  actual = path.join(root, 'raider-results', 'attachments', '0-actual.png')
  fs.writeFileSync(actual, PNG_A)
  fs.writeFileSync(path.join(root, 'raider-results', 'run.json'), '{}')
  appState.projectPath = root
  confirm = vi.fn().mockResolvedValue(true)
})

afterEach(() => {
  appState.projectPath = null
  try {
    fs.chmodSync(path.join(root, 'screenshots/baselines/chrome'), 0o755)
  } catch {
    // not created in this test
  }
  fs.rmSync(root, { recursive: true, force: true })
})

describe('acceptBaseline success', () => {
  it('writes a byte-identical copy into a new baselines folder', async () => {
    const before = hashAll(root)
    const result = await acceptBaseline(actual, OK_BASELINE, confirm)
    expect(result).toEqual({ ok: true, path: OK_BASELINE, unchanged: false })
    expect(fs.readFileSync(path.join(root, OK_BASELINE)).equals(PNG_A)).toBe(true)
    expect(confirm).toHaveBeenCalledWith(OK_BASELINE, '0-actual.png')
    expectOnlyChanged(before, [OK_BASELINE])
    expect(tmpFiles(root)).toEqual([])
  })

  it('overwrites an existing baseline and leaves siblings and other files alone', async () => {
    const dir = path.join(root, 'screenshots/baselines/chrome')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'home.png'), PNG_B)
    fs.writeFileSync(path.join(dir, 'other.png'), PNG_B)
    const before = hashAll(root)
    const result = await acceptBaseline(actual, OK_BASELINE, confirm)
    expect(result).toEqual({ ok: true, path: OK_BASELINE, unchanged: false })
    const after = hashAll(root)
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort())
    expectOnlyChanged(before, [OK_BASELINE])
    expect(tmpFiles(root)).toEqual([])
  })

  it('accepts a sub-folder name', async () => {
    const rel = 'screenshots/baselines/chrome/checkout/cart.png'
    const before = hashAll(root)
    const result = await acceptBaseline(actual, rel, confirm)
    expect(result).toEqual({ ok: true, path: rel, unchanged: false })
    expect(fs.readFileSync(path.join(root, rel)).equals(PNG_A)).toBe(true)
    expectOnlyChanged(before, [rel])
    expect(tmpFiles(root)).toEqual([])
  })

  it('reports unchanged without confirming or writing when the bytes match', async () => {
    const dir = path.join(root, 'screenshots/baselines/chrome')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'home.png'), PNG_A)
    const before = hashAll(root)
    const result = await acceptBaseline(actual, OK_BASELINE, confirm)
    expect(result).toEqual({ ok: true, path: OK_BASELINE, unchanged: true })
    expect(confirm).not.toHaveBeenCalled()
    expect(hashAll(root)).toEqual(before)
  })

  it('works when the project path goes through a symlink', async () => {
    const link = path.join(os.tmpdir(), `accept-link-${process.pid}-${Date.now()}`)
    fs.symlinkSync(root, link)
    try {
      appState.projectPath = link
      const result = await acceptBaseline(actual, OK_BASELINE, confirm)
      expect(result.ok).toBe(true)
    } finally {
      fs.unlinkSync(link)
    }
  })
})

describe('acceptBaseline cancel and failure', () => {
  it('cancelled when the user declines, nothing written', async () => {
    confirm.mockResolvedValue(false)
    const before = hashAll(root)
    expect(await acceptBaseline(actual, OK_BASELINE, confirm)).toEqual({
      ok: false,
      error: 'cancelled'
    })
    expect(hashAll(root)).toEqual(before)
    expect(fs.existsSync(path.join(root, 'screenshots'))).toBe(false)
  })

  it('cancelled when confirm throws', async () => {
    confirm.mockRejectedValue(new Error('boom /secret/path'))
    expect(await acceptBaseline(actual, OK_BASELINE, confirm)).toEqual({
      ok: false,
      error: 'cancelled'
    })
  })

  it.skipIf(process.getuid?.() === 0)(
    'writeFailed when the existing baseline cannot be read',
    async () => {
      const dir = path.join(root, 'screenshots/baselines/chrome')
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, 'home.png')
      fs.writeFileSync(file, PNG_B)
      fs.chmodSync(file, 0o000)
      try {
        expect(await acceptBaseline(actual, OK_BASELINE, confirm)).toEqual({
          ok: false,
          error: 'writeFailed'
        })
        expect(confirm).not.toHaveBeenCalled()
      } finally {
        fs.chmodSync(file, 0o644)
      }
    }
  )

  it('notFound when the actual is over the size cap', async () => {
    fs.truncateSync(actual, 50 * 1024 * 1024 + 1)
    expect(await acceptBaseline(actual, OK_BASELINE, confirm)).toEqual({
      ok: false,
      error: 'notFound'
    })
    expect(confirm).not.toHaveBeenCalled()
  })

  it('denied when the existing baseline is over the size cap', async () => {
    const dir = path.join(root, 'screenshots/baselines/chrome')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'home.png'), PNG_B)
    fs.truncateSync(path.join(dir, 'home.png'), 50 * 1024 * 1024 + 1)
    expect(await acceptBaseline(actual, OK_BASELINE, confirm)).toEqual({
      ok: false,
      error: 'denied'
    })
    expect(confirm).not.toHaveBeenCalled()
  })

  it.skipIf(process.getuid?.() === 0)(
    'writeFailed when the target folder is read-only, with no temp file left',
    async () => {
      const dir = path.join(root, 'screenshots/baselines/chrome')
      fs.mkdirSync(dir, { recursive: true })
      fs.chmodSync(dir, 0o555)
      const result = await acceptBaseline(actual, OK_BASELINE, confirm)
      expect(result).toEqual({ ok: false, error: 'writeFailed' })
      fs.chmodSync(dir, 0o755)
      expect(fs.readdirSync(dir)).toEqual([])
    }
  )
})

describe('acceptBaseline actualPath', () => {
  const expectNotFound = async (a: unknown): Promise<void> => {
    const before = hashAll(root)
    expect(await acceptBaseline(a, OK_BASELINE, confirm)).toEqual({ ok: false, error: 'notFound' })
    expect(confirm).not.toHaveBeenCalled()
    expect(hashAll(root)).toEqual(before)
  }

  it('notFound with no active project', async () => {
    appState.projectPath = null
    await expectNotFound(actual)
  })

  it('notFound for another project results folder', async () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), 'accept-other-'))
    try {
      fs.mkdirSync(path.join(other, 'raider-results', 'attachments'), { recursive: true })
      const foreign = path.join(other, 'raider-results', 'attachments', '0-actual.png')
      fs.writeFileSync(foreign, PNG_A)
      await expectNotFound(foreign)
    } finally {
      fs.rmSync(other, { recursive: true, force: true })
    }
  })

  it('notFound for a file outside attachments', async () => {
    const stray = path.join(root, 'raider-results', 'stray.png')
    fs.writeFileSync(stray, PNG_A)
    await expectNotFound(stray)
    await expectNotFound(path.join(root, 'elsewhere.png'))
  })

  it('notFound for a symlinked actual', async () => {
    const link = path.join(root, 'raider-results', 'attachments', 'link.png')
    fs.symlinkSync(actual, link)
    await expectNotFound(link)
  })

  it('notFound for a non-PNG actual', async () => {
    const jpg = path.join(root, 'raider-results', 'attachments', '0-actual.jpg')
    fs.writeFileSync(jpg, PNG_A)
    await expectNotFound(jpg)
  })

  it('notFound for a missing file and a non-string', async () => {
    await expectNotFound(path.join(root, 'raider-results', 'attachments', 'nope.png'))
    await expectNotFound(42)
    await expectNotFound(undefined)
  })
})

describe('acceptBaseline baselinePath', () => {
  const expectDenied = async (b: unknown): Promise<void> => {
    const before = hashAll(root)
    expect(await acceptBaseline(actual, b, confirm)).toEqual({ ok: false, error: 'denied' })
    expect(confirm).not.toHaveBeenCalled()
    expect(hashAll(root)).toEqual(before)
    expect(fs.existsSync(path.join(root, 'screenshots'))).toBe(false)
  }

  it.each([
    '../x.png',
    '/abs.png',
    'screenshots\\baselines\\a.png',
    'screenshots/baselines/a.png',
    'screenshots/baselines/chrome/../../x.png',
    'screenshots/baselines/chrome/../x.png',
    'screenshots/other/chrome/a.png',
    'screenshots/baselines/chrome/a.txt',
    'screenshots/baselines/chrome/.png',
    'screenshots/baselines/chrome//a.png',
    'screenshots/baselines/./chrome/a.png',
    'screenshots/baselines/chr ome/a.png',
    'screenshots/baselines/chrome/a.PNG',
    'screenshots/baselines/chrome/a\0.png',
    '',
    `screenshots/baselines/chrome/${'a'.repeat(300)}.png`
  ])('denied for %j', async (b) => {
    await expectDenied(b)
  })

  it('denied for non-strings', async () => {
    await expectDenied(undefined)
    await expectDenied(null)
    await expectDenied(['screenshots/baselines/chrome/a.png'])
    await expectDenied({})
  })
})

describe('acceptBaseline symlinks in the project', () => {
  let outside: string

  beforeEach(() => {
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'accept-outside-'))
  })
  afterEach(() => fs.rmSync(outside, { recursive: true, force: true }))

  const expectDeniedUntouched = async (): Promise<void> => {
    const before = hashAll(outside)
    expect(await acceptBaseline(actual, OK_BASELINE, confirm)).toEqual({
      ok: false,
      error: 'denied'
    })
    expect(hashAll(outside)).toEqual(before)
    expect(confirm).not.toHaveBeenCalled()
  }

  it('denied when screenshots is a symlink', async () => {
    fs.symlinkSync(outside, path.join(root, 'screenshots'))
    await expectDeniedUntouched()
  })

  it('denied when screenshots/baselines is a symlink', async () => {
    fs.mkdirSync(path.join(root, 'screenshots'))
    fs.symlinkSync(outside, path.join(root, 'screenshots/baselines'))
    await expectDeniedUntouched()
  })

  it('denied when the browser folder is a symlink', async () => {
    fs.mkdirSync(path.join(root, 'screenshots/baselines'), { recursive: true })
    fs.symlinkSync(outside, path.join(root, 'screenshots/baselines/chrome'))
    await expectDeniedUntouched()
  })

  it('denied when the target file is a symlink', async () => {
    fs.mkdirSync(path.join(root, 'screenshots/baselines/chrome'), { recursive: true })
    fs.writeFileSync(path.join(outside, 'victim.png'), PNG_B)
    fs.symlinkSync(
      path.join(outside, 'victim.png'),
      path.join(root, 'screenshots/baselines/chrome/home.png')
    )
    await expectDeniedUntouched()
  })

  it('denied when a directory in the path is a regular file', async () => {
    fs.mkdirSync(path.join(root, 'screenshots/baselines'), { recursive: true })
    fs.writeFileSync(path.join(root, 'screenshots/baselines/chrome'), 'x')
    expect(await acceptBaseline(actual, OK_BASELINE, confirm)).toEqual({
      ok: false,
      error: 'denied'
    })
  })

  it('denied when the target is a directory', async () => {
    fs.mkdirSync(path.join(root, OK_BASELINE), { recursive: true })
    expect(await acceptBaseline(actual, OK_BASELINE, confirm)).toEqual({
      ok: false,
      error: 'denied'
    })
  })
})

describe('acceptBaseline symlink swapped in during the confirm', () => {
  let outside: string

  beforeEach(() => {
    outside = fs.mkdtempSync(path.join(os.tmpdir(), 'accept-outside-'))
    fs.writeFileSync(path.join(outside, 'keep.png'), PNG_B)
  })
  afterEach(() => fs.rmSync(outside, { recursive: true, force: true }))

  const expectDeniedOutsideUntouched = async (): Promise<void> => {
    const before = hashAll(outside)
    expect(await acceptBaseline(actual, OK_BASELINE, confirm)).toEqual({
      ok: false,
      error: 'denied'
    })
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(hashAll(outside)).toEqual(before)
    expect(tmpFiles(outside)).toEqual([])
    expect(tmpFiles(root)).toEqual([])
  }

  it('denied when screenshots becomes a symlink, nothing created outside', async () => {
    confirm.mockImplementation(async () => {
      fs.symlinkSync(outside, path.join(root, 'screenshots'))
      return true
    })
    await expectDeniedOutsideUntouched()
  })

  it('denied when the browser folder becomes a symlink, nothing created outside', async () => {
    const chrome = path.join(root, 'screenshots/baselines/chrome')
    fs.mkdirSync(chrome, { recursive: true })
    confirm.mockImplementation(async () => {
      fs.rmSync(chrome, { recursive: true })
      fs.symlinkSync(outside, chrome)
      return true
    })
    await expectDeniedOutsideUntouched()
  })
})
