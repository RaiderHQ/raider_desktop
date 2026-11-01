import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { spawnSync } from 'child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))

import {
  replaceExample,
  receiverFor,
  ExampleNotUniqueError
} from '../../../src/main/handlers/tests/replaceExample'
import { readSidecar, writeSidecar } from '../../../src/main/handlers/tests/sidecar'
import { renderStep } from '../../../src/main/codegen/steps'
import type { ProjectLayout } from '../../../src/shared/types/projectLayout'
import type { Step } from '../../../src/shared/types/step'

const hasRuby = spawnSync('ruby', ['-v']).status === 0

const layout: ProjectLayout = {
  framework: 'rspec',
  automation: 'selenium',
  specPath: 'spec',
  featurePath: 'features',
  helperPath: 'helpers',
  waitHelper: false,
  recordable: true
}
const steps: Step[] = [
  { id: 's1', kind: 'navigate', url: 'https://x.test' },
  { id: 's2', kind: 'click', element: { strategy: 'css', value: '#go' } }
]
const rendered = (list: Step[], indent: string): string[] =>
  list.flatMap((s) =>
    renderStep(s, layout.automation, { receiver: 'helper' })
      .split('\n')
      .map((l) => indent + l)
  )

const ABC = [
  '# frozen_string_literal: true',
  '',
  "describe 'Shop' do",
  '  let(:wait) { Selenium::WebDriver::Wait.new(timeout: 5) }',
  '',
  "  it 'A' do",
  '    a',
  '  end',
  '',
  "  it 'B' do",
  '    b1',
  '    b2',
  '  end',
  '',
  "  it 'C' do",
  '    c',
  '  end',
  'end',
  ''
]

let project: string
const FILE = 'spec/shop_spec.rb'
const write = (lines: string[]): Promise<void> => writeFile(join(project, FILE), lines.join('\n'))
const read = async (): Promise<string> => readFile(join(project, FILE), 'utf-8')

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-replace-'))
  await mkdir(join(project, 'spec'))
})

afterEach(async () => {
  await rm(project, { recursive: true, force: true })
})

describe('receiverFor', () => {
  it('uses the instance variable in a file that drives @driver or @browser', () => {
    expect(receiverFor("    @driver.find_element(id: 'a').click")).toBe('ivar')
    expect(receiverFor("    @browser.button(id: 'a').click")).toBe('ivar')
  })

  it('keeps the helper in a file that calls driver. or browser.', () => {
    expect(receiverFor("    driver.find_element(id: 'a').click")).toBe('helper')
    expect(receiverFor("browser.goto('x')")).toBe('helper')
  })

  it('keeps the helper when a file uses both', () => {
    expect(receiverFor("@driver = make\n    driver.navigate.to('x')")).toBe('helper')
  })

  it('keeps the helper when the file names neither', () => {
    expect(receiverFor("it 'A' do\n  a\nend")).toBe('helper')
    expect(receiverFor('  @driver_options = {}')).toBe('helper')
  })
})

describe.skipIf(!hasRuby)('replaceExample', () => {
  it('writes @driver. lines into a file that uses @driver', async () => {
    const file = [
      "describe 'Shop' do",
      "  it 'A' do",
      "    @driver.find_element(id: 'a').click",
      '  end',
      '',
      "  it 'B' do",
      '    b',
      '  end',
      'end',
      ''
    ]
    await write(file)
    await replaceExample(project, layout, FILE, 'B', steps, 'ruby')
    const out = (await read()).split('\n')
    const body = steps.flatMap((s) =>
      renderStep(s, layout.automation, { receiver: 'ivar' })
        .split('\n')
        .map((l) => '    ' + l)
    )
    // The file has no @wait of its own, so one is set up first
    expect(out[6]).toBe(
      "    @wait = Selenium::WebDriver::Wait.new(timeout: YAML.load_file('config/config.yml').fetch('explicit_wait', 10))"
    )
    expect(out.slice(7, 7 + body.length)).toEqual(body)
    expect(body.every((l) => !/(^|[^@\w])driver\./.test(l))).toBe(true)
    expect(body.some((l) => l.includes('@driver.'))).toBe(true)
  })

  it('reuses a @wait the file already sets', async () => {
    const file = [
      "describe 'Shop' do",
      '  before { @wait = Selenium::WebDriver::Wait.new(timeout: 5) }',
      "  it 'A' do",
      "    @driver.find_element(id: 'a').click",
      '  end',
      "  it 'B' do",
      '    b',
      '  end',
      'end',
      ''
    ]
    await write(file)
    await replaceExample(project, layout, FILE, 'B', steps, 'ruby')
    const out = (await read()).split('\n')
    expect(out[6]).toBe('    ' + renderStep(steps[0], layout.automation, { receiver: 'ivar' }))
    expect(out.filter((l) => l.includes('@wait =')).length).toBe(1)
  })

  it('keeps driver. lines in a file that uses the driver helper', async () => {
    const file = [
      "describe 'Shop' do",
      "  it 'A' do",
      "    driver.find_element(id: 'a').click",
      '  end',
      '',
      "  it 'B' do",
      '    b',
      '  end',
      'end',
      ''
    ]
    await write(file)
    await replaceExample(project, layout, FILE, 'B', steps, 'ruby')
    const out = (await read()).split('\n')
    expect(out[6]).toMatch(/^    wait = Selenium::WebDriver::Wait\.new/)
    expect(out.slice(7, 7 + rendered(steps, '').length)).toEqual(rendered(steps, '    '))
    expect(out.slice(6).some((l) => l.includes('@driver') || l.includes('@wait'))).toBe(false)
  })

  it('replaces only the matching block', async () => {
    await write(ABC)
    await replaceExample(project, layout, FILE, 'B', steps, 'ruby')
    const out = (await read()).split('\n')
    const start = ABC.indexOf("  it 'B' do")
    const end = start + 3
    const body = rendered(steps, '    ')
    expect(out.slice(0, start)).toEqual(ABC.slice(0, start))
    expect(out[start]).toBe(ABC[start])
    expect(out.slice(start + 1, start + 1 + body.length)).toEqual(body)
    expect(out[start + 1 + body.length]).toBe(ABC[end])
    expect(out.slice(start + 2 + body.length)).toEqual(ABC.slice(end + 1))
  })

  it('turns a brace block into a do…end block', async () => {
    await write([
      "describe 'Shop' do",
      '  let(:wait) { 1 }',
      "  it('B') { expect(1).to eq 1 }",
      'end',
      ''
    ])
    await replaceExample(project, layout, FILE, 'B', steps, 'ruby')
    expect((await read()).split('\n')).toEqual([
      "describe 'Shop' do",
      '  let(:wait) { 1 }',
      "  it('B') do",
      ...rendered(steps, '    '),
      '  end',
      'end',
      ''
    ])
  })

  it('throws ExampleNotUniqueError(0) when nothing matches', async () => {
    await write(ABC)
    const error = await replaceExample(project, layout, FILE, 'Z', steps, 'ruby').catch((e) => e)
    expect(error).toBeInstanceOf(ExampleNotUniqueError)
    expect(error.count).toBe(0)
    expect(await read()).toBe(ABC.join('\n'))
  })

  it('throws ExampleNotUniqueError(2) for duplicates', async () => {
    const dup = [
      "describe 'One' do",
      "  it 'dup' do",
      '  end',
      'end',
      "describe 'Two' do",
      "  it 'dup' do",
      '  end',
      'end',
      ''
    ]
    await write(dup)
    const error = await replaceExample(project, layout, FILE, 'dup', steps, 'ruby').catch((e) => e)
    expect(error).toBeInstanceOf(ExampleNotUniqueError)
    expect(error.count).toBe(2)
    expect(await read()).toBe(dup.join('\n'))
  })

  it('adds a local wait', async () => {
    const file = ["describe 'Shop' do", "  it 'B' do", '    b', '  end', 'end', '']
    await write(file)
    await replaceExample(project, layout, FILE, 'B', steps, 'ruby')
    const out = (await read()).split('\n')
    expect(out[2]).toBe(
      "    wait = Selenium::WebDriver::Wait.new(timeout: YAML.load_file('config/config.yml').fetch('explicit_wait', 10))"
    )
    expect(out.slice(3, 3 + rendered(steps, '').length)).toEqual(rendered(steps, '    '))
  })

  it('updates a code-owned sidecar', async () => {
    await write(ABC)
    const old = '2020-01-01T00:00:00.000Z'
    await writeSidecar(project, {
      version: 1,
      id: 't1',
      name: 'Shop',
      url: 'https://x.test',
      steps: [{ id: 'o', kind: 'navigate', url: 'https://old.test' }],
      file: FILE,
      automation: 'selenium',
      hash: 'abc',
      codeOwned: true,
      createdAt: old,
      updatedAt: old
    })
    await replaceExample(project, layout, FILE, 'B', steps, 'ruby')
    const sidecar = await readSidecar(project, FILE)
    expect(sidecar?.steps).toEqual(steps)
    expect(sidecar?.codeOwned).toBe(true)
    expect(sidecar?.updatedAt).not.toBe(old)
  })

  it('refuses unlisted files', async () => {
    await write(ABC)
    await writeFile(join(project, 'spec', 'helper.rb'), "it 'B' do\nend\n")
    await expect(
      replaceExample(project, layout, 'spec/helper.rb', 'B', steps, 'ruby')
    ).rejects.toThrow()
    await expect(
      replaceExample(project, layout, '../shop_spec.rb', 'B', steps, 'ruby')
    ).rejects.toThrow()
    expect(await readFile(join(project, 'spec', 'helper.rb'), 'utf-8')).toBe("it 'B' do\nend\n")
    expect(await read()).toBe(ABC.join('\n'))
  })

  it('keeps CRLF line endings', async () => {
    await writeFile(join(project, FILE), ABC.join('\r\n'))
    await replaceExample(project, layout, FILE, 'B', steps, 'ruby')
    const start = ABC.indexOf("  it 'B' do")
    const expected = [
      ...ABC.slice(0, start + 1),
      ...rendered(steps, '    '),
      ...ABC.slice(start + 3)
    ]
    expect(await read()).toBe(expected.join('\r\n'))
  })

  it('splices a file with mixed line endings at the right lines', async () => {
    const navigate: Step[] = [{ id: 'n', kind: 'navigate', url: 'https://x.test' }]
    await writeFile(
      join(project, FILE),
      "describe 'S' do\r\n  it 'a' do\n    x\r\n  end\r\n  it 'b' do\n    y\n  end\nend\r\n"
    )
    await replaceExample(project, layout, FILE, 'a', navigate, 'ruby')
    expect(await read()).toBe(
      "describe 'S' do\r\n  it 'a' do\n" +
        rendered(navigate, '    ').join('\n') +
        "\n  end\r\n  it 'b' do\n    y\n  end\nend\r\n"
    )
    expect(spawnSync('ruby', ['-c', join(project, FILE)]).status).toBe(0)
  })
})
