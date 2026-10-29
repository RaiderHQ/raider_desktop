import { beforeEach, describe, expect, it } from 'vitest'
import path from 'path'
import {
  lastDialogDirectory,
  rememberDialogPick,
  resetDialogDirectory
} from '../../src/main/utils/dialogDirectory'

// Electron 43+ opens every dialog without a defaultPath in Downloads, so the app
// remembers the folder the user last picked from and reopens dialogs there.
describe('dialogDirectory', () => {
  beforeEach(() => resetDialogDirectory())

  it('has no directory before anything is picked', () => {
    expect(lastDialogDirectory()).toBeUndefined()
  })

  it('remembers the folder that holds the picked file or folder', () => {
    rememberDialogPick([path.join('/Users', 'me', 'projects', 'shop')])
    expect(lastDialogDirectory()).toBe(path.join('/Users', 'me', 'projects'))
  })

  it('uses the first pick when several are returned', () => {
    rememberDialogPick([path.join('/a', 'b', 'one.rb'), path.join('/c', 'two.rb')])
    expect(lastDialogDirectory()).toBe(path.join('/a', 'b'))
  })

  it('keeps the previous directory when the dialog returns nothing', () => {
    rememberDialogPick([path.join('/a', 'b', 'one.rb')])
    rememberDialogPick([])
    expect(lastDialogDirectory()).toBe(path.join('/a', 'b'))
  })
})
