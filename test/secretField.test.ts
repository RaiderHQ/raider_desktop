import { describe, it, expect, beforeEach } from 'vitest'
import { fieldValue, isSecretField } from '../src/preload/secretField'

const field = (html: string): HTMLInputElement => {
  document.body.innerHTML = html
  return document.body.firstElementChild as HTMLInputElement
}

describe('isSecretField', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it.each([
    '<input type="password">',
    '<input type="PASSWORD">',
    '<input type="text" autocomplete="current-password">',
    '<input type="text" autocomplete="section-login new-password">'
  ])('flags %s', (html) => expect(isSecretField(field(html))).toBe(true))

  it.each([
    '<input type="text">',
    '<input type="email" autocomplete="username">',
    '<textarea></textarea>',
    '<select><option>a</option></select>'
  ])('does not flag %s', (html) => expect(isSecretField(field(html))).toBe(false))
})

describe('fieldValue', () => {
  it('sends the value of an ordinary field', () => {
    const input = field('<input type="text">')
    input.value = 'me@example.com'
    expect(fieldValue(input)).toEqual({ value: 'me@example.com' })
  })

  it('sends only a secret flag for a password field, never its value', () => {
    const input = field('<input type="password">')
    input.value = 'hunter2'
    expect(fieldValue(input)).toEqual({ secret: true })
  })
})
