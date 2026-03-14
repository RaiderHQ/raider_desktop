import { formatXpath, formatLocator, createNewTest } from '@foundation/recorderUtils'

describe('formatXpath', () => {
  it('wraps simple text in single quotes', () => {
    expect(formatXpath('//div')).toBe("'//div'")
  })

  it('uses double quotes when xpath contains single quotes', () => {
    expect(formatXpath("//div[@class='main']")).toBe('"//div[@class=\'main\']"')
  })

  it('uses concat when xpath contains both single and double quotes', () => {
    const xpath = `//div[@class='main' and @title="hello"]`
    const result = formatXpath(xpath)
    expect(result).toContain('concat(')
  })
})

describe('formatLocator', () => {
  it('returns xpath strategy for xpath starting with /', () => {
    const result = formatLocator('//div[@id="main"]')
    expect(result.strategy).toBe('xpath')
    expect(result.value).toContain('//div[@id="main"]')
  })

  it('returns xpath strategy for expressions starting with (', () => {
    const result = formatLocator('(//button)[1]')
    expect(result.strategy).toBe('xpath')
  })

  it('returns id strategy for simple #id selectors', () => {
    const result = formatLocator('#my-element')
    expect(result.strategy).toBe('id')
    expect(result.value).toBe('"my-element"')
  })

  it('returns css strategy for complex # selectors with spaces', () => {
    const result = formatLocator('#parent .child')
    expect(result.strategy).toBe('css')
    expect(result.value).toBe('"#parent .child"')
  })

  it('returns css strategy for complex # selectors with combinators', () => {
    expect(formatLocator('#parent > .child').strategy).toBe('css')
    expect(formatLocator('#parent ~ .sibling').strategy).toBe('css')
    expect(formatLocator('#parent + .adjacent').strategy).toBe('css')
  })

  it('returns css strategy for class selectors', () => {
    const result = formatLocator('.my-class')
    expect(result.strategy).toBe('css')
    expect(result.value).toBe('".my-class"')
  })

  it('returns css strategy for tag selectors', () => {
    const result = formatLocator('button.submit')
    expect(result.strategy).toBe('css')
    expect(result.value).toBe('"button.submit"')
  })

  it('returns css strategy for attribute selectors', () => {
    const result = formatLocator('[data-testid="login"]')
    expect(result.strategy).toBe('css')
    expect(result.value).toBe('"[data-testid="login"]"')
  })
})

describe('createNewTest', () => {
  it('creates a test with expected default values', () => {
    const test = createNewTest()
    expect(test.name).toBe('Untitled Test')
    expect(test.url).toBe('https://raider-test-site.onrender.com/')
    expect(test.steps).toEqual([])
  })

  it('generates a unique id', () => {
    const test1 = createNewTest()
    const test2 = createNewTest()
    expect(test1.id).toBeDefined()
    expect(test1.id).not.toBe(test2.id)
  })

  it('id is a valid UUID format', () => {
    const test = createNewTest()
    expect(test.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })
})
