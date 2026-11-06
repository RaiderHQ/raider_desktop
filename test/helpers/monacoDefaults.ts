import { SHORTCUTS } from '@shared/shortcuts'
import { describe, it, expect, beforeAll } from 'vitest'

// Spec §6: the app's accelerators must not take a key the code editor already uses.
// Monaco registers its default keybindings while it loads, decoded for the OS it detects
// (under vitest that is process.platform: the browser branch is not taken) and keeps them
// for the life of the module graph, so each OS is checked from its own test file.
// Keybindings are from monaco-editor 0.52.2 (editor.all.js, the full editor).

type Os = 'mac' | 'win'
const PROCESS_PLATFORM: Record<Os, string> = { mac: 'darwin', win: 'win32' }

interface Chord {
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  metaKey: boolean
  keyCode: number
}

/** "ctrl+shift+K": modifiers in a fixed order, then the key, upper-cased */
const normalise = (
  m: { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean },
  key: string
): string =>
  [m.ctrl && 'ctrl', m.alt && 'alt', m.shift && 'shift', m.meta && 'meta', key.toUpperCase()]
    .filter(Boolean)
    .join('+')

/** Electron's CmdOrCtrl is Cmd (meta) on macOS and Ctrl elsewhere */
const accelerator = (value: string, os: Os): string => {
  const parts = value.split('+')
  const key = parts.pop() as string
  const has = (name: string): boolean => parts.includes(name)
  const cmdOrCtrl = has('CmdOrCtrl')
  return normalise(
    {
      ctrl: os === 'win' && cmdOrCtrl,
      meta: os === 'mac' && cmdOrCtrl,
      shift: has('Shift'),
      alt: has('Alt')
    },
    key
  )
}

const monacoDefaults = async (os: Os): Promise<{ chords: Set<string>; count: number }> => {
  const realPlatform = process.platform
  Object.defineProperty(process, 'platform', { value: PROCESS_PLATFORM[os], configurable: true })
  // The clipboard contribution probes this at load; jsdom does not have it
  ;(document as unknown as Record<string, unknown>).queryCommandSupported = (): boolean => false
  try {
    await import('monaco-editor/esm/vs/editor/editor.all.js')
  } finally {
    Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true })
  }
  const { KeybindingsRegistry } = await import(
    'monaco-editor/esm/vs/platform/keybinding/common/keybindingsRegistry.js'
  )
  const { KeyCodeUtils } = await import('monaco-editor/esm/vs/base/common/keyCodes.js')
  const items = KeybindingsRegistry.getDefaultKeybindings() as {
    keybinding: { chords: Chord[] } | null
  }[]
  const chords = new Set<string>()
  for (const item of items) {
    // A multi-chord binding (Cmd+K Cmd+X) takes its first chord from the app as well
    const first = item.keybinding?.chords[0]
    if (!first) continue
    chords.add(
      normalise(
        { ctrl: first.ctrlKey, shift: first.shiftKey, alt: first.altKey, meta: first.metaKey },
        KeyCodeUtils.toString(first.keyCode)
      )
    )
  }
  return { chords, count: items.length }
}

/**
 * Collisions found by this check and not yet resolved: Ctrl+Shift+R is Monaco's Refactor on
 * Windows and Linux, and the app's Record / Stop & save key. The app ships on macOS only, where
 * the key is free; this list makes the collision visible and fails when it is fixed or grows.
 */
const KNOWN_COLLISIONS: Record<Os, string[]> = { mac: [], win: ['record', 'stop'] }

export const checkAcceleratorsAgainstMonaco = (os: Os): void => {
  describe(`app accelerators against Monaco defaults (${os})`, () => {
    let defaults: Set<string>
    beforeAll(async () => {
      const loaded = await monacoDefaults(os)
      // A loader that registered nothing would make every check below pass for nothing
      expect(loaded.count).toBeGreaterThan(100)
      defaults = loaded.chords
    }, 120_000)

    it('knows the keys Monaco is known to use', () => {
      const key = (name: string): string =>
        os === 'mac'
          ? normalise({ ctrl: false, shift: false, alt: false, meta: true }, name)
          : normalise({ ctrl: true, shift: false, alt: false, meta: false }, name)
      for (const known of ['F', 'Z', 'D', '/']) expect(defaults).toContain(key(known))
    })

    it('collides with Monaco only where it is known to', () => {
      const colliding = Object.entries(SHORTCUTS)
        .filter(([, shortcut]) => defaults.has(accelerator(shortcut.accelerator, os)))
        .map(([id]) => id)
      expect(colliding).toEqual(KNOWN_COLLISIONS[os])
    })
  })
}
