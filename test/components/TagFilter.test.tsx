import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect } from 'vitest'
import TagFilter from '@components/TagFilter'
import type { TestRow } from '@foundation/testKey'
import en from '@assets/translations/en.json'

const translate = (key: string): string => {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
  return typeof value === 'string' ? value : key
}
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: typeof translate } => ({ t: translate })
}))

const row = (name: string, tags: string[]): TestRow => ({
  name,
  testId: name,
  ownership: 'recorded',
  file: `${name}.rb`,
  tags
})

describe('TagFilter', () => {
  it('lists all tests first, then every tag once, sorted', () => {
    render(
      <TagFilter
        rows={[row('a', ['smoke', 'login']), row('b', ['smoke']), row('c', [])]}
        value={null}
        onChange={vi.fn()}
      />
    )
    const select = screen.getByTestId('tag-filter')
    expect(select).toHaveAccessibleName('Tag')
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
    expect(options).toEqual(['All tests', 'login', 'smoke'])
  })

  it('reports the chosen tag, and null for all tests', () => {
    const onChange = vi.fn()
    render(<TagFilter rows={[row('a', ['smoke'])]} value={null} onChange={onChange} />)
    fireEvent.change(screen.getByTestId('tag-filter'), { target: { value: 'smoke' } })
    expect(onChange).toHaveBeenCalledWith('smoke')
    fireEvent.change(screen.getByTestId('tag-filter'), { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('is hidden when no test has a tag', () => {
    render(<TagFilter rows={[row('a', [])]} value={null} onChange={vi.fn()} />)
    expect(screen.queryByTestId('tag-filter')).not.toBeInTheDocument()
  })
})
