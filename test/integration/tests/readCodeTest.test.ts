import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { readCodeTest } from '../../../src/main/handlers/tests/readCodeTest'

let project: string

beforeEach(async () => {
  project = await mkdtemp(join(tmpdir(), 'raider-read-'))
  await mkdir(join(project, 'spec'), { recursive: true })
})
afterEach(async () => {
  await rm(project, { recursive: true, force: true })
})

const GEM_SPEC = `describe 'Login' do
  let(:login_page) { Login.new(driver) }

  context 'with right credentials' do
    it 'can successfully log in' do
      account_page.visit
      expect(header).to eq "Welcome back #{user['name']}"
    end
  end

  context 'with wrong credentials' do
    it 'cannot log in' do
      # a comment

      login_page.visit
      expect(header).to eq 'Login or register'
    end
  end
end
`

describe('readCodeTest', () => {
  it('two examples read separately', async () => {
    await writeFile(join(project, 'spec/login_page_spec.rb'), GEM_SPEC)
    const view = await readCodeTest(project, 'spec/login_page_spec.rb')
    expect(view.file).toBe('spec/login_page_spec.rb')
    expect(view.examples.map((e) => e.name)).toEqual(['can successfully log in', 'cannot log in'])
    expect(view.examples[0].steps).toHaveLength(2)
    expect(view.examples[1].steps).toHaveLength(2)
    for (const e of view.examples) for (const s of e.steps) expect(s.kind).toBe('custom')
  })

  it('a file without it blocks is one example of custom lines', async () => {
    await writeFile(join(project, 'spec/x_spec.rb'), 'puts 1\n\n# c\nputs 2\n')
    const view = await readCodeTest(project, 'spec/x_spec.rb')
    expect(view.examples).toHaveLength(1)
    expect(view.examples[0].name).toBe('x_spec.rb')
    expect(view.examples[0].steps.map((s) => s.kind)).toEqual(['custom', 'custom'])
  })

  it('refuses paths outside the project or non-spec files and never writes', async () => {
    await writeFile(join(project, 'spec/x_spec.rb'), 'puts 1\n')
    await expect(readCodeTest(project, '../x_spec.rb')).rejects.toThrow()
    await expect(readCodeTest(project, 'spec/x.rb')).rejects.toThrow()
    expect(await readFile(join(project, 'spec/x_spec.rb'), 'utf-8')).toBe('puts 1\n')
  })
})
