import { describe, it, expect, beforeEach } from 'vitest'
import {
  implicitRole,
  accessibleName,
  labelText,
  looksGenerated
} from '../src/preload/accessibleName'

const first = (selector: string): Element => document.querySelector(selector)!

describe('implicitRole', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it.each([
    ['<button>x</button>', 'button'],
    ['<input type="submit">', 'button'],
    ['<input type="button">', 'button'],
    ['<input type="reset">', 'button'],
    ['<a href="/x">x</a>', 'link'],
    ['<input>', 'textbox'],
    ['<input type="email">', 'textbox'],
    ['<textarea></textarea>', 'textbox'],
    ['<input type="checkbox">', 'checkbox'],
    ['<input type="radio">', 'radio'],
    ['<select></select>', 'combobox'],
    ['<h1>x</h1>', 'heading'],
    ['<h6>x</h6>', 'heading']
  ])('%s is a %s', (html, role) => {
    document.body.innerHTML = html
    expect(implicitRole(document.body.firstElementChild!)).toBe(role)
  })

  it.each([['<a>no href</a>'], ['<div>x</div>'], ['<input type="hidden">']])(
    '%s has no implicit role',
    (html) => {
      document.body.innerHTML = html
      expect(implicitRole(document.body.firstElementChild!)).toBeNull()
    }
  )
})

describe('accessibleName', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('prefers aria-label over text', () => {
    document.body.innerHTML = '<button aria-label="Close dialog">X</button>'
    expect(accessibleName(first('button'))).toBe('Close dialog')
  })

  it('reads the text of aria-labelledby elements', () => {
    document.body.innerHTML =
      '<span id="a">Billing</span><span id="b"> address </span><input aria-labelledby="a b">'
    expect(accessibleName(first('input'))).toBe('Billing address')
  })

  it('reads label[for]', () => {
    document.body.innerHTML = '<label for="e">  Email\n address </label><input id="e">'
    expect(accessibleName(first('input'))).toBe('Email address')
  })

  it('reads a wrapping label, ignoring the control inside it', () => {
    document.body.innerHTML = '<label>Country <select><option>France</option></select></label>'
    expect(accessibleName(first('select'))).toBe('Country')
  })

  it('reads the value of a submit input', () => {
    document.body.innerHTML = '<input type="submit" value="Sign in">'
    expect(accessibleName(first('input'))).toBe('Sign in')
  })

  it('reads the text of buttons, links and headings', () => {
    document.body.innerHTML = '<a href="/p">  <span>Pricing</span>\n</a>'
    expect(accessibleName(first('a'))).toBe('Pricing')
  })

  it('does not name a plain div from its text', () => {
    document.body.innerHTML = '<div>Hello</div>'
    expect(accessibleName(first('div'))).toBeNull()
  })

  it('falls back to placeholder', () => {
    document.body.innerHTML = '<input placeholder="Search">'
    expect(accessibleName(first('input'))).toBe('Search')
  })

  it('is null when empty or over 80 characters', () => {
    document.body.innerHTML = `<button>   </button><button>${'a'.repeat(81)}</button>`
    const [empty, long] = document.querySelectorAll('button')
    expect(accessibleName(empty)).toBeNull()
    expect(accessibleName(long)).toBeNull()
  })
})

describe('labelText', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('reads label[for] then a wrapping label', () => {
    document.body.innerHTML =
      '<label for="u">User name</label><input id="u"><label>Remember me <input type="checkbox"></label>'
    expect(labelText(first('#u'))).toBe('User name')
    expect(labelText(first('[type=checkbox]'))).toBe('Remember me')
  })

  it('is null for an unlabelled control or a non-control', () => {
    document.body.innerHTML = '<input aria-label="x"><label for="d">Hi</label><div id="d"></div>'
    expect(labelText(first('input'))).toBeNull()
    expect(labelText(first('#d'))).toBeNull()
  })
})

describe('looksGenerated', () => {
  it.each([
    ':r1:',
    'ember123',
    'a1b2c3d4e5',
    'btn-12345',
    'ext-gen7',
    'react-select-2',
    'mui-3',
    'radix-:r2:'
  ])('%s looks generated', (id) => expect(looksGenerated(id)).toBe(true))

  it.each(['login', 'save-btn', 'step2', 'h1-title'])('%s does not look generated', (id) =>
    expect(looksGenerated(id)).toBe(false)
  )
})
