import { hasSeenGuide, markGuideSeen } from '@foundation/recordingGuideSeen'

describe('recordingGuideSeen', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('is false until marked, then true', () => {
    expect(hasSeenGuide()).toBe(false)
    markGuideSeen()
    expect(hasSeenGuide()).toBe(true)
  })

  it('does not throw when localStorage does', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(hasSeenGuide()).toBe(false)
    expect(() => markGuideSeen()).not.toThrow()
  })
})
