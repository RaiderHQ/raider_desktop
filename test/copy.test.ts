import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import en from '../src/renderer/src/assets/translations/en.json'

/** Proper nouns and acronyms that keep their capitals in sentence-case copy. */
const PROPER_NOUNS = [
  'Ruby',
  'Raider',
  'RSpec',
  'Cucumber',
  'Selenium',
  'Appium',
  'Chrome',
  'Firefox',
  'URL',
  'CI',
  'Esc',
  'HTML',
  'GitHub',
  'OS',
  'Windows',
  'macOS',
  'Linux',
  'iOS',
  'Android',
  'JSON',
  'YAML',
  'API',
  'Hideout',
  'Longship',
  'Watir',
  'Homebrew',
  'WSL',
  'LLM',
  'AI'
]

/** Copy decisions from the 2026-11-06 hand test (D10, D12, sentence case, jargon). */
describe('copy', () => {
  it('does not promise hover help or run history the app does not have (D10)', () => {
    expect(en.concepts.hint).not.toMatch(/Hover over any/)
    expect(en.help.overview.dashboard.message).not.toMatch(/trends|run history/)
    expect(en.dashboard.noResults.subtitle).toMatch(/Tests tab/)
  })

  it('calls a test that lives in a file "From file", not edited (D12)', () => {
    expect(en.tests.editedInCode).toBe('From file')
  })

  it('uses sentence case in the Files toolbar and the Dashboard', () => {
    expect(en.overview.settings.runMode.all).toBe('All tests')
    expect(en.overview.settings.rerunFailed).toBe('Re-run failed')
    expect(en.settings.recording.implicitWait.label).toBe('Implicit wait')
    expect(en.settings.recording.explicitWait.label).toBe('Explicit wait')
    expect(en.settings.timeout.updateButton).toBe('Update timeout')
    expect(en.testResults.breakdown).toBe('Test results breakdown')
    expect(en.testResults.viewScreenshot).toBe('View screenshot')
    expect(en.dashboard.overallSummary).toBe('Overall summary')
    expect(en.dashboard.totalTests).toBe('Total tests')
    expect(en.dashboard.viewTrace).toBe('View trace')
    expect(en.dashboard.backToResults).toBe('Back to results')
    expect(en.dashboard.traceTitle).toBe('Trace view')
  })

  it('speaks plainly in the empty recorder and on the landing page', () => {
    expect(en.recorder.placeholder.commands).toBe(
      'Steps you record will appear here. Press Record to begin.'
    )
    expect(en.landing.subtitle).toBe('Record, run and fix UI tests without leaving the app.')
  })
  it('words the save branch plainly (PR B)', () => {
    expect(en.testPage.autosaved).toBe('Changes to this test are saved automatically.')
    expect(en.files.unsavedSuffix).toBe('{{name}}, unsaved changes')
    expect(en.closeGuard.message).toBe('Save changes to {{name}}?')
    expect(en.closeGuard.save).toBe('Save')
    expect(en.closeGuard.discard).toBe("Don't save")
    expect(en.closeGuard.cancel).toBe('Cancel')
  })

  it('uses sentence case in the modals and menus', () => {
    expect(en.concepts.title).toBe('How Ruby Raider works')
    expect(en.concepts.hint).toBe('Hover any button for what it does.')
    expect(en.overview.tabs.scaffold).toBe('Scaffolding')
    expect(en.overview.openTerminal).toBe('Open terminal')
    expect(en.files.menu.copyPath).toBe('Copy path')
    expect(en.files.menu.rename).toBe('Rename')
    expect(en.files.menu.duplicate).toBe('Duplicate')
    expect(en.files.menu.delete).toBe('Delete')
    expect(en.files.delete.title).toBe('Delete file?')
    expect(en.files.delete.cancel).toBe('Cancel')
    expect(en.files.delete.confirm).toBe('Delete')
    expect(en.files.rename.title).toBe('Rename file')
    expect(en.common.back).toBe('Go back')
    expect(en.header.howItWorks).toBe('How Ruby Raider works')
    expect(en.landing.bubble).toBe('New here? Click me.')
    expect(en.recorder.step.editCommand).toBe('Edit command')
  })

  it('every tooltip is sentence case, short and has no shortcut typed in', () => {
    const strings: [string, string][] = []
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') strings.push([path, node])
      else if (node && typeof node === 'object')
        for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`)
    }
    walk(en.tooltips, 'tooltips')
    expect(strings.length).toBeGreaterThan(50)
    const offenders: string[] = []
    for (const [path, text] of strings) {
      const bare = text.replace(/https:\/\/\S+/g, '').trim()
      const words = bare.split(/\s+/).filter(Boolean)
      const stray = words
        .slice(1)
        .filter(
          (w) =>
            /[A-Z]/.test(w) &&
            !PROPER_NOUNS.includes(w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
        )
      if (!/^[A-Z0-9]/.test(text)) offenders.push(`${path}: must start upper case or digit`)
      if (stray.length) offenders.push(`${path}: stray capitals ${stray.join(', ')}`)
      if (words.length > 14) offenders.push(`${path}: ${words.length} words`)
      if (/[⌘⇧]|Ctrl\+|Cmd\+/.test(text)) offenders.push(`${path}: shortcut typed in`)
    }
    expect(offenders).toEqual([])
  })

  it('the check dialogs speak plainly', () => {
    const m = en.recorder.assertionTextModal
    expect(Object.values(m.titles)).toEqual([
      'Check the text',
      'Check the text contains',
      'Check the value',
      'Check the page title',
      'Check the address'
    ])
    expect(m.save).toBe('Add check')
    expect(en.assertions.menu.header).toBe('Add a check')
  })

  it('words the recording guide plainly', () => {
    expect(en.guide.step1).toBe(
      'Use the page on the right as you normally would. Every click and keystroke becomes a step here.'
    )
    expect(en.guide.step2).toBe(
      'To check something, press Check something\u2026 (or right-click the page) and choose what to check.'
    )
    expect(en.guide.step3Before + en.guide.step3Middle + en.guide.step3After).toBe(
      'Press Stop & save when you are done, then Run to see it pass.'
    )
  })

  it('names the tests menu "More" with an accessible name (V4)', () => {
    expect(en.tests.moreMenu.label).toBe('More')
    expect(en.tests.moreMenu.actions).toBe('More test actions')
    expect(en.tooltips.tests.runTagged.noTag).toBe('Pick a tag first')
  })

  it('says "View file" for the test\'s Ruby file, with no ellipsis (U1)', () => {
    expect(en.testPage.editCode).toBe('View file')
    expect(en.appMenu.openFile).toBe('View file')
    expect(en.shortcuts.actions['open-file']).toBe('View file')
    expect(en.tooltips.testPage.openFile).toBe("View this test's Ruby file in the editor")
  })

  it('explains the view toggle: "Show as" with "Visual steps" and "Ruby code" (U2)', () => {
    expect(en.testPage.view).toBe('Show as')
    expect(en.testPage.steps).toBe('Visual steps')
    expect(en.testPage.ruby).toBe('Ruby code')
  })

  it('names an empty run filter plainly (U6)', () => {
    expect(en.run.filterEmpty).toEqual({
      all: 'No results yet',
      noneListed: 'No tests were listed for this run',
      failed: 'No failed tests in this run',
      failedSoFar: 'No failed tests so far',
      failedUnlisted: 'This run failed. Open Technical details below for the output.',
      running: 'Nothing running',
      queued: 'Nothing queued'
    })
  })

  it('no title case in buttons, labels and titles', () => {
    const names = [
      'title',
      'label',
      'button',
      'save',
      'cancel',
      'close',
      'delete',
      'rename',
      'start',
      'stop',
      'run',
      'record'
    ]
    const found: [string, string][] = []
    const walk = (node: unknown, path: string): void => {
      if (typeof node === 'string') found.push([path, node])
      else if (node && typeof node === 'object')
        for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k)
    }
    walk(en, '')
    const offenders: string[] = []
    let checked = 0
    for (const [path, text] of found) {
      const last = path.split('.').pop() as string
      if (!(names.includes(last) || /(Button|Label|Title)$/.test(last))) continue
      checked++
      // The first word is skipped below; after a stripped placeholder that is the next word.
      // Step numbers ("1. Install") and {{placeholders}} are not words.
      const words = text
        .replace(/^\d+\.\s*/, '')
        .replace(/\{\{[^}]*\}\}\??/g, '')
        .split(/\s+/)
        .filter(Boolean)
      // Allowlisted names may also be followed by a second name ("Ruby Raider", "Google Chrome").
      const stray = words
        .slice(1)
        .filter(
          (w) =>
            /[A-Z]/.test(w) &&
            !PROPER_NOUNS.includes(w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
        )
      if (stray.length) offenders.push(`${path}: "${text}" (${stray.join(', ')})`)
    }
    expect(checked).toBeGreaterThan(50)
    expect(offenders).toEqual([])
  })

  it('names the recent projects plainly (U8)', () => {
    expect(en.landing.recentProjects).toEqual({
      title: 'Recent projects',
      hint: 'Projects you opened with Raider on this computer.',
      opened: 'Opened {{date}}',
      folderNotFound: 'Folder not found',
      notRaider: 'No Raider config in this folder',
      remove: 'Remove',
      removeLabel: 'Remove {{name}} from recent projects'
    })
    expect(en.tooltips.landing.recentProject).toBe('Open this project')
    expect(en.appMenu.openRecent).toBe('Open recent')
    expect(en.appMenu.clearRecent).toBe('Clear recent')
    expect(en.appMenu.noRecentProjects).toBe('No recent projects')
  })

  it('names the project menu plainly (U7)', () => {
    expect(en.overview.projectMenu).toEqual({
      switch: 'Switch project…',
      new: 'New project…',
      unsaved: 'Save or discard your changes first',
      project: 'Project'
    })
    expect(en.tooltips.overview.projectMenu).toBe('Switch to another project or start a new one')
  })
})

/** JSON keeps the last of two equal keys, so a duplicate silently drops strings (U5). */
describe('en.json catalog', () => {
  const SOURCE = resolve(__dirname, '../src/renderer/src/assets/translations/en.json')
  const text = readFileSync(SOURCE, 'utf8')

  /** Every object key that appears twice in the same object, as a dotted path. */
  const duplicateKeys = (json: string): string[] => {
    const dups: string[] = []
    let i = 0
    const ws = (): void => {
      while (i < json.length && /\s/.test(json[i])) i++
    }
    const str = (): string => {
      let s = ''
      i++ // opening quote
      while (json[i] !== '"') {
        if (i >= json.length) throw new Error('unterminated string in en.json')
        if (json[i] === '\\') {
          s += json[i] + json[i + 1]
          i += 2
          continue
        }
        s += json[i++]
      }
      i++ // closing quote
      return s
    }
    const value = (path: string[]): void => {
      ws()
      const c = json[i]
      if (c === '{') object(path)
      else if (c === '[') array(path)
      else if (c === '"') str()
      else while (i < json.length && !/[,\]}]/.test(json[i])) i++
    }
    const object = (path: string[]): void => {
      i++
      const seen = new Set<string>()
      ws()
      if (json[i] === '}') {
        i++
        return
      }
      for (;;) {
        ws()
        const key = str()
        if (seen.has(key)) dups.push([...path, key].join('.'))
        seen.add(key)
        ws()
        i++ // colon
        value([...path, key])
        ws()
        if (json[i] === ',') {
          i++
          continue
        }
        i++ // closing brace
        return
      }
    }
    const array = (path: string[]): void => {
      i++
      ws()
      if (json[i] === ']') {
        i++
        return
      }
      for (;;) {
        value(path)
        ws()
        if (json[i] === ',') {
          i++
          continue
        }
        i++ // closing bracket
        return
      }
    }
    value([])
    return dups
  }

  it('has no duplicate key at any level', () => {
    expect(duplicateKeys('{"a":{"b":1,"b":2},"a":3,"c":[{"d":1,"d":2}]}')).toEqual([
      'a.b',
      'a',
      'c.d'
    ])
    expect(duplicateKeys(text)).toEqual([])
  })

  it('has every key the renderer asks for by name', () => {
    const walk = (key: string): unknown =>
      key.split('.').reduce<unknown>((node, part) => {
        if (node && typeof node === 'object' && Object.hasOwn(node, part))
          return (node as Record<string, unknown>)[part]
        return undefined
      }, en)
    const isString = (key: string): boolean => typeof walk(key) === 'string'
    // Plurals live under key_one and key_other, both needed
    const lookup = (key: string): boolean =>
      isString(key) || (isString(`${key}_one`) && isString(`${key}_other`))
    const sources = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) return sources(full)
        return /\.tsx?$/.test(entry.name) ? [full] : []
      })
    const files = sources(resolve(__dirname, '../src'))
    const wanted = new Set<string>()
    const prefixes = new Set<string>()
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      // Main's menus define t as englishText(`prefix.${key}`); their keys live under that prefix
      const prefix =
        src.match(
          /const t = \(key: string\): string => englishText\(`([A-Za-z.]+)\$\{key\}`\)/
        )?.[1] ?? ''
      // t('key'), t("key"), t(`key`) with no ${}, englishText('key'), and both branches of
      // t(cond ? 'a' : 'b')
      for (const m of src.matchAll(/\bt\(\s*(['"`])([A-Za-z0-9_.-]+)\1/g)) wanted.add(prefix + m[2])
      for (const m of src.matchAll(/\benglishText\(\s*(['"])([A-Za-z0-9_.-]+)\1/g)) wanted.add(m[2])
      for (const m of src.matchAll(
        /\bt\(\s*[^?)\n]*\?\s*(['"])([A-Za-z0-9_.-]+)\1\s*:\s*(['"])([A-Za-z0-9_.-]+)\3/g
      )) {
        wanted.add(prefix + m[2])
        wanted.add(prefix + m[4])
      }
      // t(`prefix.${x}`): the branch under the prefix must at least exist
      for (const m of src.matchAll(/\bt\(\s*`([A-Za-z0-9_.-]+)\.\$\{/g)) prefixes.add(prefix + m[1])
    }
    expect(wanted.size).toBeGreaterThan(200)
    const missing = [...wanted].filter((key) => !lookup(key)).sort()
    expect(missing).toEqual([])
    expect(prefixes.size).toBeGreaterThan(5)
    const missingBranches = [...prefixes].filter((p) => typeof walk(p) !== 'object').sort()
    expect(missingBranches).toEqual([])
  })
})
