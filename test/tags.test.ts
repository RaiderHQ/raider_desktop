import { describe, it, expect } from 'vitest'
import {
  TAG_RE,
  describeLineWithTags,
  normalizeTags,
  tagsFromDescribeLine
} from '../src/shared/tags'

describe('normalizeTags', () => {
  it('trims, lower-cases, de-duplicates and sorts', () => {
    expect(normalizeTags([' Smoke ', 'api', 'SMOKE', 'a_1'])).toEqual(['a_1', 'api', 'smoke'])
  })
  it('drops non-strings and invalid tags', () => {
    expect(normalizeTags(['1a', 'a-b', '', 'ok', 4, null, {}, 'a b', '_x'])).toEqual(['ok'])
  })
  it('returns [] for a non-array', () => {
    expect(normalizeTags('smoke')).toEqual([])
    expect(normalizeTags(undefined)).toEqual([])
  })
  it('TAG_RE', () => {
    expect(TAG_RE.test('smoke_2')).toBe(true)
    expect(TAG_RE.test('Smoke')).toBe(false)
  })
})

describe('tagsFromDescribeLine', () => {
  it.each([
    ["describe 'A', :smoke do", ['smoke']],
    ['RSpec.describe "A", :b, :a do', ['a', 'b']],
    ["describe 'A', 'smoke', \"api\" do", ['api', 'smoke']],
    ["RSpec.describe('A', :smoke) do", ['smoke']],
    ["describe 'A', :smoke, type: :feature do", ['smoke']],
    ["describe 'A', type: :feature, js: { a: 1, b: :c } do", []],
    ["describe 'A, :nope' do", []],
    ['describe Foo, :smoke do', ['smoke']],
    ["describe 'A', :smoke # :other", ['smoke']],
    ["describe 'A' do", []],
    ["it 'A', :smoke do", []],
    ["describe 'A', :Bad-Tag do", []]
  ])('%s', (line, expected) => {
    expect(tagsFromDescribeLine(line)).toEqual(expected)
  })
})

describe('describeLineWithTags', () => {
  it('replaces tag metadata and keeps the description and hash metadata', () => {
    expect(describeLineWithTags("describe 'A', :old, type: :feature do", ['b', 'a'])).toBe(
      "describe 'A', :a, :b, type: :feature do"
    )
  })
  it('adds and removes tags', () => {
    expect(describeLineWithTags("RSpec.describe 'A' do", ['x'])).toBe("RSpec.describe 'A', :x do")
    expect(describeLineWithTags("describe 'A', :x do", [])).toBe("describe 'A' do")
  })
  it('handles the parenthesised form', () => {
    expect(describeLineWithTags("RSpec.describe('A', :x) do", ['y'])).toBe(
      "RSpec.describe('A', :y) do"
    )
  })
  it('returns null for a non-describe line', () => {
    expect(describeLineWithTags("it 'A' do", ['x'])).toBeNull()
  })
})
