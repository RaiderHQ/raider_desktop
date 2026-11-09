import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { IpcMainInvokeEvent } from 'electron'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { mockSafeExec, mockExistsSync } = vi.hoisted(() => ({
  mockSafeExec: vi.fn(),
  mockExistsSync: vi.fn(() => true)
}))

vi.mock('../../src/main/utils/safeExec', () => ({
  safeExec: (...args: unknown[]) => mockSafeExec(...args)
}))

vi.mock('electron', () => ({
  BrowserWindow: class {},
  app: { getPath: (): string => '/' },
  shell: { trashItem: vi.fn() }
}))

vi.mock('fix-path', () => ({
  default: vi.fn()
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs')
  return {
    ...actual,
    default: { ...actual, existsSync: mockExistsSync },
    existsSync: mockExistsSync
  }
})

import handler, { isGemSafeFolder } from '../../src/main/handlers/project/scaffoldGenerate'
import { appState } from '../../src/main/handlers/appState'

const mockEvent = {} as IpcMainInvokeEvent

beforeEach(() => {
  vi.clearAllMocks()
})

describe('scaffoldGenerate handler', () => {
  it('returns error when project path does not exist', async () => {
    mockExistsSync.mockReturnValueOnce(false)

    const result = await handler(
      mockEvent,
      { operation: 'generate', type: 'page', name: 'login', path: 'page_objects/pages' },
      '/nonexistent/project',
      'ruby'
    )

    expect(result.success).toBe(false)
    expect(result.error).toContain('Project path does not exist')
    expect(mockSafeExec).not.toHaveBeenCalled()
  })
})

// The Files tab's New page object… / New spec… / New component… / New helper… on a folder
describe('scaffoldGenerate into a folder (--path)', () => {
  let project: string
  let outside: string

  const generate = (params: Record<string, unknown>, path = project): ReturnType<typeof handler> =>
    handler(mockEvent, { operation: 'generate', ...params } as never, path, 'ruby')

  // Plays the gem: writes the file the command names, as Ruby Raider would
  const gemWrites = (rel: string): void => {
    mockSafeExec.mockImplementation(async () => {
      await writeFile(join(project, rel), 'generated')
      return { stdout: `      create  ${rel}`, stderr: '', exitCode: 0 }
    })
  }

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), 'scaffold-folder-'))
    outside = mkdtempSync(join(tmpdir(), 'scaffold-out-'))
    mkdirSync(join(project, 'page_objects', 'pages'), { recursive: true })
    mkdirSync(join(project, 'my pages'))
    mkdirSync(join(project, '--force'))
    mkdirSync(join(project, '.git'))
    writeFileSync(join(project, 'Gemfile'), "gem 'selenium-webdriver'\ngem 'rspec'\n")
    appState.projectPath = project
  })

  afterEach(() => {
    appState.projectPath = null
    rmSync(project, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  })

  it.each([
    ['page', 'page_objects/pages/checkout_page.rb'],
    ['spec', 'page_objects/pages/checkout_spec.rb'],
    ['component', 'page_objects/pages/checkout.rb'],
    ['helper', 'page_objects/pages/checkout_helper.rb']
  ])('runs raider g %s with --path= and returns the new file', async (type, file) => {
    gemWrites(file)
    const result = await generate({ type, name: 'checkout', path: 'page_objects/pages' })

    expect(result).toEqual({
      success: true,
      output: `create  ${file}`,
      files: [file]
    })
    const command = mockSafeExec.mock.calls[0][0] as string
    expect(command).toMatch(new RegExp(`&& raider g ${type} checkout '--path=page_objects/pages'$`))
  })

  // The Scaffolding tab is gone: nothing generates into config.yml's default folders
  it('refuses a call without a folder, without running anything', async () => {
    const result = await generate({ type: 'page', name: 'checkout' })
    expect(result).toEqual({ success: false, output: '', error: 'Not a folder path' })
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  // Whatever arrives over IPC: nothing runs unless every field is right
  it.each([
    ['no params', undefined, 'Unsupported type for a folder: undefined'],
    ['null params', null, 'Unsupported type for a folder: undefined'],
    ['no operation', { type: 'page', name: 'checkout', path: 'page_objects/pages' }, 'Unsupported type for a folder: page'],
    ['another operation', { operation: 'delete', type: 'page', name: 'checkout', path: 'page_objects/pages' }, 'Unsupported type for a folder: page'],
    ['no type', { operation: 'generate', name: 'checkout', path: 'page_objects/pages' }, 'Unsupported type for a folder: undefined'],
    ['a number as the name', { operation: 'generate', type: 'page', name: 42, path: 'page_objects/pages' }, 'A name starts with a letter and has only letters, digits and underscores.']
  ])('refuses %s without running anything', async (_label, params, error) => {
    const result = await handler(mockEvent, params as never, project, 'ruby')
    // A thrown TypeError would land in the outer catch with another message
    expect(result).toMatchObject({ success: false, error })
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it('returns a failure when running the gem throws', async () => {
    mockSafeExec.mockRejectedValueOnce(new Error('spawn failed'))
    const result = await generate({ type: 'page', name: 'checkout', path: 'page_objects/pages' })
    expect(result).toEqual({ success: false, output: '', error: 'spawn failed' })
  })

  it('wraps the command with rbenv init and cd to the project', async () => {
    gemWrites('page_objects/pages/checkout_page.rb')
    await generate({ type: 'page', name: 'checkout', path: 'page_objects/pages' })
    const command = mockSafeExec.mock.calls[0][0] as string
    expect(command).toContain('rbenv init')
    expect(command).toContain(`cd ${project} && `)
  })

  it('drops every field the gem does not take', async () => {
    gemWrites('page_objects/pages/checkout_page.rb')
    await generate({
      type: 'page',
      name: 'checkout',
      path: 'page_objects/pages',
      uses: ['a'],
      from: 'x.rb',
      ai: true,
      crud: true
    })
    expect(mockSafeExec.mock.calls[0][0]).toMatch(
      /&& raider g page checkout '--path=page_objects\/pages'$/
    )
  })

  it('quotes the folder as one argument, flag and all', async () => {
    gemWrites('my pages/checkout_page.rb')
    await generate({ type: 'page', name: 'checkout', path: 'my pages' })
    expect(mockSafeExec.mock.calls[0][0]).toMatch(/&& raider g page checkout '--path=my pages'$/)
  })

  // Thor reads --no-path / --skip-path as "no path": the gem would write to its default instead
  it.each(['--force', '--no-path', 'pages/--skip-path'])(
    'refuses the flag-like folder %j without running anything',
    async (folder) => {
      const result = await generate({ type: 'helper', name: 'x', path: folder })
      expect(result).toMatchObject({ success: false, code: 'invalidName' })
      expect(mockSafeExec).not.toHaveBeenCalled()
    }
  )

  it('predicts the name the gem normalizes to (CheckoutPage → checkout_page.rb)', async () => {
    gemWrites('page_objects/pages/checkout_page.rb')
    const result = await generate({
      type: 'page',
      name: 'CheckoutPage',
      path: 'page_objects/pages'
    })
    expect(result.files).toEqual(['page_objects/pages/checkout_page.rb'])
  })

  it('refuses when the file is already there, before running anything', async () => {
    writeFileSync(join(project, 'page_objects', 'pages', 'checkout_page.rb'), 'mine')
    const result = await generate({ type: 'page', name: 'checkout', path: 'page_objects/pages' })

    expect(result).toMatchObject({
      success: false,
      code: 'exists',
      error: 'page_objects/pages/checkout_page.rb already exists'
    })
    expect(mockSafeExec).not.toHaveBeenCalled()
    expect(await readFile(join(project, 'page_objects/pages/checkout_page.rb'), 'utf-8')).toBe(
      'mine'
    )
  })

  it('counts a dangling link at the file name as taken', async () => {
    symlinkSync(join(outside, 'gone.rb'), join(project, 'page_objects', 'pages', 'x_page.rb'))
    const result = await generate({ type: 'page', name: 'x', path: 'page_objects/pages' })
    expect(result).toMatchObject({ success: false, code: 'exists' })
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it.each([
    ['traversal', '../x'],
    ['a nested traversal', 'page_objects/../../x'],
    ['an absolute path', '/etc'],
    ["Git's folder", '.git'],
    ["Raider's folder", '.raider'],
    ['the project root', ''],
    ['a missing folder', 'nope'],
    ['a file', 'Gemfile'],
    ['a backslash', 'page_objects\\pages'],
    ['not a string', 42]
  ])('refuses %s as the folder', async (_label, path) => {
    const result = await generate({ type: 'page', name: 'checkout', path })
    expect(result.success).toBe(false)
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it('refuses a link that leads out of the project', async () => {
    symlinkSync(outside, join(project, 'out'))
    const result = await generate({ type: 'page', name: 'checkout', path: 'out' })
    expect(result.success).toBe(false)
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it.each([
    '',
    'admin/users',
    '../x',
    'login page',
    "a'b",
    'a;rm -rf ~',
    '--force',
    '_x',
    '9a',
    'é'
  ])('refuses the name %j', async (name) => {
    const result = await generate({ type: 'page', name, path: 'page_objects/pages' })
    expect(result).toMatchObject({ success: false, code: 'invalidName' })
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it.each(['scaffold', 'feature', 'steps', 'destroy'])('refuses the %s type', async (type) => {
    const result = await generate({ type, name: 'checkout', path: 'page_objects/pages' })
    expect(result.success).toBe(false)
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it('refuses when the open project is another one', async () => {
    const other = mkdtempSync(join(tmpdir(), 'scaffold-other-'))
    mkdirSync(join(other, 'page_objects', 'pages'), { recursive: true })
    try {
      const result = await generate(
        { type: 'page', name: 'checkout', path: 'page_objects/pages' },
        other
      )
      expect(result).toMatchObject({ success: false, code: 'projectChanged' })
      expect(mockSafeExec).not.toHaveBeenCalled()
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  it('still generates nothing into a mobile project', async () => {
    writeFileSync(join(project, 'Gemfile'), "gem 'appium_lib'\n")
    const result = await generate({ type: 'page', name: 'checkout', path: 'page_objects/pages' })
    expect(result).toMatchObject({
      success: false,
      error: 'Mobile projects are not supported in this version.'
    })
    expect(mockSafeExec).not.toHaveBeenCalled()
  })

  it("passes the gem's failure on", async () => {
    mockSafeExec.mockResolvedValue({ stdout: '', stderr: 'boom', exitCode: 1 })
    const result = await generate({ type: 'page', name: 'checkout', path: 'page_objects/pages' })
    expect(result).toMatchObject({ success: false, error: 'boom' })
  })

  it('fails when the gem said yes but the file is not there', async () => {
    mockSafeExec.mockResolvedValue({ stdout: 'odd', stderr: '', exitCode: 0 })
    const result = await generate({ type: 'page', name: 'checkout', path: 'page_objects/pages' })
    expect(result).toMatchObject({ success: false })
    expect(result.error).toContain('page_objects/pages/checkout_page.rb')
  })
})

describe('isGemSafeFolder', () => {
  it.each(['--no-path', 'pages/--skip-path', '-x', 'a/-b'])('refuses %j, which the gem could read as an option', (folder) => {
    expect(isGemSafeFolder(folder, 'darwin')).toBe(false)
  })
  it('refuses % and ! on Windows only', () => {
    expect(isGemSafeFolder('a%PATH%', 'win32')).toBe(false)
    expect(isGemSafeFolder('a!b', 'win32')).toBe(false)
    expect(isGemSafeFolder('a%PATH%', 'darwin')).toBe(true)
  })
  it('accepts ordinary folders', () => {
    expect(isGemSafeFolder('page_objects/pages', 'win32')).toBe(true)
    expect(isGemSafeFolder('spec/a-b', 'linux')).toBe(true)
  })
})

