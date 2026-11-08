import { describe, it, expect, beforeEach } from 'vitest'
import {
  implicitRole,
  accessibleName,
  accessibleNameSource,
  labelText,
  looksGenerated,
  visibleText
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
    ['<input type="image" alt="Go">', 'button'],
    ['<input type="search">', 'textbox'],
    ['<input type="password">', 'textbox'],
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

  it.each([
    ['<a>no href</a>'],
    ['<div>x</div>'],
    ['<input type="hidden">'],
    ['<input type="file">'],
    ['<input type="range">'],
    ['<input type="date">'],
    ['<input type="color">']
  ])('%s has no implicit role', (html) => {
    document.body.innerHTML = html
    expect(implicitRole(document.body.firstElementChild!)).toBeNull()
  })
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

  // The role engine consults aria-labelledby first and only then aria-label
  it('prefers aria-labelledby over aria-label', () => {
    document.body.innerHTML =
      '<span id="l">Billing</span><input aria-labelledby="l" aria-label="Other">'
    expect(accessibleName(first('input'))).toBe('Billing')
  })

  it('falls back to aria-label when aria-labelledby points at nothing or at empty text', () => {
    document.body.innerHTML =
      '<span id="e"> </span><input aria-labelledby="missing" aria-label="A"><input aria-labelledby="e" aria-label="B">'
    const [a, b] = document.querySelectorAll('input')
    expect(accessibleName(a)).toBe('A')
    expect(accessibleName(b)).toBe('B')
  })

  it('skips aria-hidden text inside an aria-labelledby target', () => {
    document.body.innerHTML =
      '<span id="l"><i aria-hidden="true">*</i> Required</span><input aria-labelledby="l">'
    expect(accessibleName(first('input'))).toBe('Required')
  })

  it('prefers a button value or image alt over its label', () => {
    document.body.innerHTML =
      '<label for="s">Send it</label><input id="s" type="submit" value="Go">' +
      '<label for="i">Picture</label><input id="i" type="image" alt="Search">'
    expect(accessibleName(first('#s'))).toBe('Go')
    expect(accessibleName(first('#i'))).toBe('Search')
  })

  describe('name from content, as the role engine walks it', () => {
    it.each([
      ['<button><span aria-hidden="true">x</span> Close</button>', 'button', 'Close'],
      ['<button><span hidden>Old</span>New</button>', 'button', 'New'],
      ['<button>Save<script>1</script></button>', 'button', 'Save'],
      ['<a href="/"><img alt="Logo"> Home</a>', 'a', 'Logo Home'],
      ['<a href="/"><img alt="Logo">Home</a>', 'a', 'LogoHome'],
      ['<a href="/"><img src="x.png"> Home</a>', 'a', 'Home'],
      ['<button><i aria-label="search"></i> Search</button>', 'button', 'search Search'],
      ['<h2><span>Billing </span><em>address</em></h2>', 'h2', 'Billing address'],
      ['<button><input type="hidden" value="t">Go</button>', 'button', 'Go']
    ])('%s is named %s', (html, selector, name) => {
      document.body.innerHTML = html
      expect(accessibleName(first(selector))).toBe(name)
    })

    it('is null when only hidden text is left', () => {
      document.body.innerHTML = '<button><span aria-hidden="true">x</span></button>'
      expect(accessibleName(first('button'))).toBeNull()
    })
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

describe('accessibleNameSource', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it.each([
    ['<button>Save</button>', 'button', 'Save', 'content'],
    ['<input type="submit" value="Send">', 'input', 'Send', 'content'],
    ['<button aria-label="Close">X</button>', 'button', 'Close', 'aria-label'],
    ['<span id="l">Billing</span><input aria-labelledby="l">', 'input', 'Billing', 'other'],
    ['<label for="e">Email</label><input id="e">', 'input', 'Email', 'other'],
    ['<label>Agree <input type="checkbox"></label>', 'input', 'Agree', 'other'],
    ['<input placeholder="Search">', 'input', 'Search', 'other'],
    ['<input type="image" alt="Go">', 'input', 'Go', 'other']
  ])('%s is named %s from %s', (html, selector, name, from) => {
    document.body.innerHTML = html
    expect(accessibleNameSource(first(selector))).toEqual({ name, from })
  })

  it('is null without a name', () => {
    document.body.innerHTML = '<input>'
    expect(accessibleNameSource(first('input'))).toBeNull()
  })

  it('reports content for a name computed by the visible walk', () => {
    document.body.innerHTML = '<button><span aria-hidden="true">x</span> Close</button>'
    expect(accessibleNameSource(first('button'))).toEqual({ name: 'Close', from: 'content' })
  })

  it('reports aria-labelledby, not aria-label, when both are set', () => {
    document.body.innerHTML =
      '<span id="l">Billing</span><input aria-labelledby="l" aria-label="Other">'
    expect(accessibleNameSource(first('input'))).toEqual({ name: 'Billing', from: 'other' })
  })
})

describe('visibleText', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('keeps hidden text out but leaves normalizedText alone', () => {
    document.body.innerHTML = '<p><span aria-hidden="true">x</span> Close <b hidden>y</b></p>'
    const p = first('p')
    expect(visibleText(p)).toBe('Close')
    expect(p.textContent?.replace(/\s+/g, ' ').trim()).toBe('x Close y')
  })

  it('collapses whitespace across nested elements without gluing words together', () => {
    document.body.innerHTML = '<p>\n  <span>Read the</span>\n  <b>terms</b> first\n</p>'
    expect(visibleText(first('p'))).toBe('Read the terms first')
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

describe('a label read as a name and as a locator', () => {
  // The role engine skips hidden markup for the name; the runtime's label: XPath compares
  // normalize-space(.) and keeps it
  it('a hidden required-field asterisk is not in the name but is in the label text', () => {
    document.body.innerHTML =
      '<label for="e">Email <span aria-hidden="true">*</span></label><input id="e">' +
      '<label>Phone <span hidden>(optional)</span><input id="p"></label>'
    expect(accessibleName(document.getElementById('e')!)).toBe('Email')
    expect(labelText(document.getElementById('e')!)).toBe('Email *')
    expect(accessibleName(document.getElementById('p')!)).toBe('Phone')
    expect(labelText(document.getElementById('p')!)).toBe('Phone (optional)')
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
