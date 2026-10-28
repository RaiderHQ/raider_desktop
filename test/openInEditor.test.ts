import { vi } from 'vitest'
import { editorTargetFor, resolveEditorTarget } from '@foundation/openInEditor'

describe('editorTargetFor', () => {
  it('resolves a relative frame against the project path', () => {
    expect(editorTargetFor('/p', "spec/a_spec.rb:12:in 'x'")).toEqual({
      fileName: 'a_spec.rb',
      filePath: '/p/spec/a_spec.rb',
      line: 12
    })
  })

  it('returns null for absolute frames', () => {
    expect(editorTargetFor('/p', '/other/spec/a_spec.rb:3')).toBeNull()
    expect(editorTargetFor('C:\\p', "C:/proj/spec/a_spec.rb:4:in 'x'")).toBeNull()
  })

  it('returns null for frames that climb out of the project', () => {
    expect(editorTargetFor('/p', '../../.ssh/config:1')).toBeNull()
    expect(editorTargetFor('/p', 'spec/../../x.rb:1')).toBeNull()
    expect(editorTargetFor('/p', 'spec\\..\\x.rb:1')).toBeNull()
  })

  it('joins a Windows project path without doubling separators', () => {
    expect(editorTargetFor('C:\\p\\', 'spec/a_spec.rb:1')?.filePath).toBe('C:\\p/spec/a_spec.rb')
  })

  it('returns null for an unparseable frame', () => {
    expect(editorTargetFor('/p', 'garbage')).toBeNull()
  })
})

describe('resolveEditorTarget', () => {
  it('returns the target when the file can be read', async () => {
    const readFile = vi.fn().mockResolvedValue({ success: true, data: '' })
    const target = await resolveEditorTarget('/p', 'spec/a_spec.rb:12', { readFile })
    expect(target?.line).toBe(12)
    expect(readFile).toHaveBeenCalledWith('/p/spec/a_spec.rb')
  })

  it('returns null when the file cannot be read', async () => {
    const readFile = vi.fn().mockResolvedValue({ success: false })
    expect(await resolveEditorTarget('/p', 'spec/a_spec.rb:12', { readFile })).toBeNull()
  })

  it('returns null for an unparseable frame without reading', async () => {
    const readFile = vi.fn()
    expect(await resolveEditorTarget('/p', 'garbage', { readFile })).toBeNull()
    expect(readFile).not.toHaveBeenCalled()
  })
})
