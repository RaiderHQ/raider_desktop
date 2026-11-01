import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

import { detectWaitHelper } from '../../src/main/handlers/project/waitHelperDetection'

let dir: string

async function helpers(
  specHelper: string | null,
  { waitHelper = true, helperPath = 'helpers' } = {}
): Promise<void> {
  await mkdir(join(dir, helperPath), { recursive: true })
  if (waitHelper) await writeFile(join(dir, helperPath, 'wait_helper.rb'), 'module WaitHelper\nend\n')
  if (specHelper !== null) await writeFile(join(dir, helperPath, 'spec_helper.rb'), specHelper)
}

const config = (include: string): string =>
  `RSpec.configure do |config|\n${include}\nend\n`

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wait-helper-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('detectWaitHelper', () => {
  it('is false when wait_helper.rb is a directory', async () => {
    await helpers(config('  config.include WaitHelper'), { waitHelper: false })
    await mkdir(join(dir, 'helpers', 'wait_helper.rb'))
    expect(await detectWaitHelper(dir, 'helpers')).toBe(false)
  })

  it('true with wait_helper.rb and a parenthesised include', async () => {
    await helpers(config('    config.include(WaitHelper)'))
    expect(await detectWaitHelper(dir, 'helpers')).toBe(true)
  })

  it('true with an include that has no parentheses', async () => {
    await helpers(config('  config.include WaitHelper'))
    expect(await detectWaitHelper(dir, 'helpers')).toBe(true)
  })

  it('false when the include line is commented out', async () => {
    await helpers(config('  # config.include(WaitHelper)'))
    expect(await detectWaitHelper(dir, 'helpers')).toBe(false)
  })

  it('false without an include line', async () => {
    await helpers(config('    config.include(OtherHelper)'))
    expect(await detectWaitHelper(dir, 'helpers')).toBe(false)
  })

  it('false without wait_helper.rb', async () => {
    await helpers(config('    config.include(WaitHelper)'), { waitHelper: false })
    expect(await detectWaitHelper(dir, 'helpers')).toBe(false)
  })

  it('follows a custom helper path', async () => {
    await helpers(config('    config.include(WaitHelper)'), { helperPath: 'support/helpers' })
    expect(await detectWaitHelper(dir, 'support/helpers')).toBe(true)
    expect(await detectWaitHelper(dir, 'helpers')).toBe(false)
  })

  it('false when spec_helper.rb cannot be read', async () => {
    await helpers(null)
    await mkdir(join(dir, 'helpers', 'spec_helper.rb'))
    expect(await detectWaitHelper(dir, 'helpers')).toBe(false)
  })
})
