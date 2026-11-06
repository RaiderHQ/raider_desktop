import { describe, it, expect } from 'vitest'
import { windowTitle } from '../src/shared/windowTitle'

const doc = (edited: boolean): { name: string; edited: boolean } => ({
  name: 'login_spec.rb',
  edited
})

describe('windowTitle', () => {
  it('names the document, project and app', () => {
    expect(windowTitle({ document: doc(false), project: 'my_project', platform: 'mac' })).toBe(
      'login_spec.rb — my_project — Ruby Raider'
    )
  })
  it('names the project and app without a document', () => {
    expect(windowTitle({ project: 'my_project', platform: 'mac' })).toBe('my_project — Ruby Raider')
  })
  it('is just the app with nothing open', () => {
    expect(windowTitle({ platform: 'other' })).toBe('Ruby Raider')
  })
  it('prefixes a dot when edited on other platforms', () => {
    expect(windowTitle({ document: doc(true), project: 'my_project', platform: 'other' })).toBe(
      '• login_spec.rb — my_project — Ruby Raider'
    )
  })
  it('has no prefix on a Mac, which has its own dot', () => {
    expect(
      windowTitle({ document: doc(true), project: 'my_project', platform: 'mac' }).startsWith('•')
    ).toBe(false)
  })
})
