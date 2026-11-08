import { describe, it, expect } from 'vitest'
import { FOLDER_SCAFFOLD_TYPES, isScaffoldName, scaffoldFileName } from '../src/shared/scaffoldName'

describe('isScaffoldName', () => {
  it.each(['checkout', 'Checkout', 'CheckoutPage', 'login_form', 'step2', 'a'])(
    'accepts %s',
    (name) => expect(isScaffoldName(name)).toBe(true)
  )

  it.each([
    '',
    ' checkout',
    'checkout ',
    '_checkout',
    '2fa',
    'admin/users',
    '../x',
    'check-out',
    'check out',
    'login.rb',
    '--force',
    "a'b",
    'a;b',
    'é',
    'x'.repeat(101),
    undefined,
    42
  ])('refuses %j', (name) => expect(isScaffoldName(name)).toBe(false))
})

// The names Ruby Raider 4.0.1 writes with --path (checked against the real gem)
describe('scaffoldFileName', () => {
  it.each([
    ['page', 'checkout', 'checkout_page.rb'],
    ['spec', 'checkout', 'checkout_spec.rb'],
    ['helper', 'checkout', 'checkout_helper.rb'],
    ['component', 'checkout', 'checkout.rb'],
    ['page', 'CheckoutPage', 'checkout_page.rb'],
    ['page', 'checkout_page', 'checkout_page.rb'],
    ['spec', 'login_page_spec', 'login_page_spec.rb'],
    ['helper', 'Session_helper', 'session_helper.rb'],
    ['component', 'HTMLHeader', 'html_header.rb'],
    ['page', 'smoke_test', 'smoke_page.rb'],
    ['page', 'page', 'page_page.rb'],
    ['page', 'a_test_page', 'a_page.rb'],
    ['helper', 'A1B', 'a1_b_helper.rb'],
    ['component', 'aBC', 'a_bc.rb']
  ] as const)('%s %s writes %s', (type, name, file) => {
    expect(scaffoldFileName(type, name)).toBe(file)
  })

  it('offers the four types that take a folder', () => {
    expect(FOLDER_SCAFFOLD_TYPES).toEqual(['page', 'spec', 'component', 'helper'])
  })
})
