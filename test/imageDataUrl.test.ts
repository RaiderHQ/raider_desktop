import { describe, it, expect } from 'vitest'
import { imageDataUrl } from '@foundation/imageDataUrl'

describe('imageDataUrl', () => {
  it('types a .jpg or .jpeg picture as jpeg', () => {
    expect(imageDataUrl({ data: 'AA', fileExt: '.jpg' })).toBe('data:image/jpeg;base64,AA')
    expect(imageDataUrl({ data: 'AA', fileExt: '.JPEG' })).toBe('data:image/jpeg;base64,AA')
  })

  it('types a .png, or any other picture, as png', () => {
    expect(imageDataUrl({ data: 'AA', fileExt: '.png' })).toBe('data:image/png;base64,AA')
    expect(imageDataUrl({ data: 'AA', fileExt: '.gif' })).toBe('data:image/png;base64,AA')
    expect(imageDataUrl({ data: 'AA' })).toBe('data:image/png;base64,AA')
  })

  it('gives null without data', () => {
    expect(imageDataUrl({})).toBeNull()
    expect(imageDataUrl({ data: '', fileExt: '.png' })).toBeNull()
  })
})
