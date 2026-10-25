import { createNewTest } from '@foundation/recorderUtils'

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
