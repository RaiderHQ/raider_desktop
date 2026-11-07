import { describe, it, expect } from 'vitest'
import {
  MAX_TAGS,
  TAG_RE,
  findDescribeLine,
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

describe('normalizeTags limits', () => {
  it('drops tags over 40 characters and keeps at most 20', () => {
    expect(normalizeTags(['a'.repeat(41), 'a'.repeat(40)])).toEqual(['a'.repeat(40)])
    const many = Array.from({ length: 30 }, (_, i) => `t${String(i).padStart(2, '0')}`)
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS)
    expect(MAX_TAGS).toBe(20)
  })
})

describe('tagsFromDescribeLine', () => {
  it.each([
    ["describe 'A', :smoke do", ['smoke']],
    ['RSpec.describe "A", :b, :a do', ['a', 'b']],
    ["describe 'A', 'smoke', \"api\" do", []],
    ["RSpec.describe('A', :smoke) do", ['smoke']],
    ["describe 'A', :smoke, type: :feature do", ['smoke']],
    ['RSpec.describe "x", :a, type: :feature do', ['a']],
    ["describe 'A', type: :feature, js: { a: 1, b: :c } do", []],
    ["describe 'A, :nope' do", []],
    ['describe Foo, :smoke do', ['smoke']],
    ["describe 'A', :smoke do # :other", ['smoke']],
    ["describe 'A' do", []],
    ["it 'A', :smoke do", []],
    ["describe 'A', :Smoke do", []],
    ['describe User, "validations" do', []],
    ["describe Foo, :bar, '#baz' do", []],
    ["describe 'x',\n  type: :feature do", []],
    ["describe %q(it's) do", []],
    ['describe = x', []],
    ["describe 'A', :smoke,", []],
    ["describe 'A', :smoke", []]
  ])('%s', (line, expected) => {
    expect(tagsFromDescribeLine(line)).toEqual(expected)
  })
})

describe('describeLineWithTags', () => {
  it('replaces trailing symbols and keeps the description and the hash last', () => {
    expect(describeLineWithTags("describe 'A', :old, type: :feature do", ['b', 'a'])).toBe(
      "describe 'A', :a, :b, type: :feature do"
    )
    expect(describeLineWithTags('RSpec.describe "x", :a, type: :feature do', ['z'])).toBe(
      'RSpec.describe "x", :z, type: :feature do'
    )
  })
  it('keeps other positional arguments before the tags', () => {
    expect(describeLineWithTags("describe Foo, '#bar' do", ['a'])).toBe(
      "describe Foo, '#bar', :a do"
    )
    expect(describeLineWithTags('describe User, "validations", :old do', ['a'])).toBe(
      'describe User, "validations", :a do'
    )
  })
  it('never rewrites a symbol that is not a tag', () => {
    expect(describeLineWithTags("describe 'A', :Smoke, :old do", ['a'])).toBe(
      "describe 'A', :Smoke, :a do"
    )
    expect(describeLineWithTags("describe 'A', :x, 'str' do", ['a'])).toBe(
      "describe 'A', :x, 'str', :a do"
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
  it.each([
    "it 'A' do",
    "describe 'x',\n  type: :feature do",
    "describe 'x', do",
    "describe 'x',",
    "describe('x',",
    "describe('x', :a",
    "describe 'x, do",
    "describe 'x'",
    "describe 'x' # do",
    "describe %q(it's) do",
    'describe = x'
  ])('refuses %s', (line) => {
    expect(describeLineWithTags(line, ['a'])).toBeNull()
  })
})

describe('findDescribeLine', () => {
  it('skips =begin blocks, heredocs and comments', () => {
    const text = [
      '# describe "c", :no do',
      '=begin',
      'describe "b", :no do',
      '=end',
      'x = <<~EOS',
      "  describe 'h', :no do",
      'EOS',
      "describe 'real', :yes do",
      "describe 'later' do"
    ].join('\n')
    expect(findDescribeLine(text)?.line).toBe("describe 'real', :yes do")
  })
  it('ignores describe = x and returns the offset', () => {
    const text = "describe = 1\n  RSpec.describe 'A' do\n"
    const found = findDescribeLine(text)
    expect(found?.line).toBe("  RSpec.describe 'A' do")
    expect(text.slice(found!.index, found!.index + found!.line.length)).toBe(found!.line)
  })
  it('is null without one', () => {
    expect(findDescribeLine("it 'x' do\nend\n")).toBeNull()
  })
})
