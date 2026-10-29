import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { spawnSync } from 'child_process'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({ BrowserWindow: class {}, app: { getPath: (): string => '/' } }))

import { locateExamples } from '../../../src/main/handlers/tests/exampleLocator'

const hasRuby = spawnSync('ruby', ['-v']).status === 0

let dir: string
const spec = async (body: string): Promise<string> => {
  const file = join(dir, 'x_spec.rb')
  await writeFile(file, body)
  return file
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'raider-locate-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe.skipIf(!hasRuby)('locateExamples', () => {
  it('finds the one literal match', async () => {
    const f = await spec(
      [
        "describe 'Session' do",
        "  it 'logs in' do",
        '    [1].each do |x|',
        '      x',
        '    end',
        '    text = <<~TXT',
        '      end',
        '    TXT',
        '  end',
        '',
        "  it 'logs out' do",
        '    [2].each do |y|',
        '      y',
        '    end',
        '    note = <<~TXT',
        '      logs in',
        '    TXT',
        '  end',
        'end',
        ''
      ].join('\n')
    )
    expect(await locateExamples(dir, f, 'logs in', 'ruby')).toEqual([{ startLine: 2, endLine: 9 }])
  })

  it('brace blocks', async () => {
    const f = await spec("describe 'B' do\n  it('x') { expect(1).to eq 1 }\nend\n")
    const ranges = await locateExamples(dir, f, 'x', 'ruby')
    expect(ranges).toHaveLength(1)
    expect(ranges[0].startLine).toBe(ranges[0].endLine)
  })

  it('ignores interpolated names', async () => {
    const f = await spec('describe \'I\' do\n  it "a #{b}" do\n    1\n  end\nend\n')
    expect(await locateExamples(dir, f, 'a #{b}', 'ruby')).toEqual([])
  })

  it('same name twice', async () => {
    const f = await spec(
      "describe 'One' do\n  it 'dup' do\n  end\nend\n\ndescribe 'Two' do\n  it 'dup' do\n  end\nend\n"
    )
    expect(await locateExamples(dir, f, 'dup', 'ruby')).toHaveLength(2)
  })

  it('specify / scenario', async () => {
    const f = await spec(
      "describe 'S' do\n  specify 'one' do\n  end\n\n  scenario 'two' do\n  end\nend\n"
    )
    expect(await locateExamples(dir, f, 'one', 'ruby')).toEqual([{ startLine: 2, endLine: 3 }])
    expect(await locateExamples(dir, f, 'two', 'ruby')).toEqual([{ startLine: 5, endLine: 6 }])
  })

  it('finds non-ASCII names without a UTF-8 locale', async () => {
    const f = await spec("describe 'Accès' do\n  it 'connexion réussie' do\n    1\n  end\nend\n")
    const saved = {
      LANG: process.env.LANG,
      LC_ALL: process.env.LC_ALL,
      LC_CTYPE: process.env.LC_CTYPE
    }
    process.env.LANG = 'C'
    process.env.LC_ALL = 'C'
    delete process.env.LC_CTYPE
    try {
      expect(await locateExamples(dir, f, 'connexion réussie', 'ruby')).toEqual([
        { startLine: 2, endLine: 4 }
      ])
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
  })
})
