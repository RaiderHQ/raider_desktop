import { render, screen, fireEvent, act, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import TestsList from '@components/TestsList'
import useProjectStore from '@foundation/Stores/projectStore'
import { useTestsListStore } from '@foundation/Stores/testsListStore'
import { useRunStore } from '@foundation/Stores/runStore'
import { useTickedTestsStore } from '@foundation/Stores/tickedTestsStore'
import type { TestRow } from '@foundation/testKey'
import en from '@assets/translations/en.json'

// The real copy (with i18next's _one/_other plurals), so labels are checked word for word
const lookup = (key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en)
const translate = (key: string, options: Record<string, string | number> = {}): string => {
  const plural =
    typeof options.count === 'number'
      ? lookup(`${key}_${options.count === 1 ? 'one' : 'other'}`)
      : undefined
  const value = plural ?? lookup(key)
  if (typeof value !== 'string') return key
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options[name] ?? ''))
}
vi.mock('react-i18next', () => ({
  useTranslation: (): { t: typeof translate } => ({ t: translate })
}))
vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() })
  return { default: toast, toast, Toaster: (): null => null }
})

const rows: TestRow[] = [
  {
    name: 'Login works',
    file: 'spec/login_spec.rb',
    testId: 't1',
    ownership: 'recorded',
    tags: []
  },
  { name: 'Cart totals', file: 'spec/cart_spec.rb', ownership: 'code', tags: [] },
  { name: 'Unsaved draft', testId: 't9', ownership: 'recorded', missingFile: true, tags: [] },
  { name: 'API health', file: 'spec/api_spec.rb', ownership: 'code', tags: [] }
]

const start = vi.fn()

const setup = (
  over: Partial<React.ComponentProps<typeof TestsList>> = {}
): ReturnType<typeof render> & { props: React.ComponentProps<typeof TestsList> } => {
  const props = { rows, selectedKey: null, onSelect: vi.fn(), onNewTest: vi.fn(), ...over }
  const view = render(<TestsList {...props} />)
  return { props, ...view }
}

const selectButton = (): HTMLElement => screen.getByRole('button', { name: en.tests.select })
const tickBox = (name: string): HTMLElement =>
  screen.getByRole('checkbox', { name: `Tick ${name}` })
const ticked = (): string[] => useTickedTestsStore.getState().ticked('/p')

beforeEach(() => {
  vi.clearAllMocks()
  // @ts-expect-error - Mocking window.api
  window.api = {
    setActiveProject: vi.fn().mockResolvedValue({ success: true }),
    readDirectory: vi.fn().mockResolvedValue([])
  }
  useProjectStore.setState({ projectPath: '/p' })
  useTestsListStore.setState({ rows })
  useTickedTestsStore.setState({ byProject: {} })
  useRunStore.setState({ run: null, origin: null, isActive: false, start })
})

afterEach(() => useProjectStore.setState({ layout: null, projectPath: null }))

describe('TestsList ticking', () => {
  it('Select is a toggle that shows a tick box per row and the footer', () => {
    setup()
    expect(selectButton()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    fireEvent.click(selectButton())

    expect(selectButton()).toHaveAttribute('aria-pressed', 'true')
    expect(tickBox('Login works')).toHaveAttribute('aria-checked', 'false')
    expect(tickBox('API health')).toBeInTheDocument()
    expect(screen.getByText('0 ticked')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.tests.runTicked })).toBeDisabled()
    expect(screen.getByRole('button', { name: en.tests.clearTicked })).toBeDisabled()

    fireEvent.click(selectButton())
    expect(selectButton()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('0 ticked')).not.toBeInTheDocument()
  })

  it('a click ticks the row instead of opening it, and a second click unticks it', () => {
    const { props } = setup()
    fireEvent.click(selectButton())

    fireEvent.click(tickBox('Cart totals'))
    expect(props.onSelect).not.toHaveBeenCalled()
    expect(tickBox('Cart totals')).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('1 ticked')).toBeInTheDocument()
    expect(ticked()).toEqual(['spec/cart_spec.rb'])

    fireEvent.click(tickBox('Cart totals'))
    expect(tickBox('Cart totals')).toHaveAttribute('aria-checked', 'false')
    expect(ticked()).toEqual([])
  })

  it('Shift-click ticks the range from the last clicked row', () => {
    setup()
    fireEvent.click(selectButton())
    fireEvent.click(tickBox('Login works'))
    fireEvent.click(tickBox('API health'), { shiftKey: true })

    expect(ticked().sort()).toEqual(['spec/api_spec.rb', 'spec/cart_spec.rb', 'spec/login_spec.rb'])
    expect(screen.getByText('3 ticked')).toBeInTheDocument()
  })

  it('Space on a focused row ticks it', () => {
    const { props } = setup()
    fireEvent.click(selectButton())
    const box = tickBox('Login works')
    box.focus()
    fireEvent.keyDown(box, { key: ' ' })

    expect(box).toHaveAttribute('aria-checked', 'true')
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('a row with no spec file cannot be ticked', () => {
    setup()
    fireEvent.click(selectButton())
    const box = tickBox('Unsaved draft')
    expect(box).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(box)
    expect(ticked()).toEqual([])
  })

  it('Esc leaves Select mode and keeps the ticks', () => {
    setup()
    fireEvent.click(selectButton())
    fireEvent.click(tickBox('Login works'))
    fireEvent.keyDown(tickBox('Login works'), { key: 'Escape' })

    expect(selectButton()).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(ticked()).toEqual(['spec/login_spec.rb'])

    fireEvent.click(selectButton())
    expect(tickBox('Login works')).toHaveAttribute('aria-checked', 'true')
  })

  it('outside Select mode a click opens the test as before', () => {
    const { props } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Login works/ }))
    expect(props.onSelect).toHaveBeenCalledWith('id:t1')
    expect(ticked()).toEqual([])
  })

  it('drops the tick of a file that leaves the list', () => {
    setup()
    fireEvent.click(selectButton())
    fireEvent.click(tickBox('Login works'))
    fireEvent.click(tickBox('Cart totals'))

    act(() => useTestsListStore.setState({ rows: rows.filter((r) => r.name !== 'Cart totals') }))

    expect(ticked()).toEqual(['spec/login_spec.rb'])
    expect(screen.getByText('1 ticked')).toBeInTheDocument()
  })

  it('Run starts a run of the ticked files, in list order', () => {
    setup()
    fireEvent.click(selectButton())
    fireEvent.click(tickBox('API health'))
    fireEvent.click(tickBox('Login works'))
    fireEvent.click(screen.getByRole('button', { name: en.tests.runTicked }))

    expect(start).toHaveBeenCalledWith(
      { kind: 'files', files: ['spec/login_spec.rb', 'spec/api_spec.rb'] },
      { route: '/overview/tests', label: '2 ticked' }
    )
  })

  it('Schedule… shows only with a handler, and hands it the ticked files', () => {
    const { unmount } = setup()
    fireEvent.click(selectButton())
    expect(screen.queryByRole('button', { name: en.tests.scheduleTicked })).not.toBeInTheDocument()
    unmount()

    const onScheduleTicked = vi.fn()
    setup({ onScheduleTicked })
    fireEvent.click(selectButton())
    const schedule = screen.getByRole('button', { name: en.tests.scheduleTicked })
    expect(schedule).toBeDisabled()
    fireEvent.click(tickBox('Cart totals'))
    fireEvent.click(schedule)
    expect(onScheduleTicked).toHaveBeenCalledWith(['spec/cart_spec.rb'])
  })

  it('Clear unticks every test', () => {
    setup()
    fireEvent.click(selectButton())
    fireEvent.click(tickBox('Login works'))
    fireEvent.click(tickBox('API health'))
    const footer = screen.getByTestId('ticked-footer')
    fireEvent.click(within(footer).getByRole('button', { name: en.tests.clearTicked }))

    expect(ticked()).toEqual([])
    expect(screen.getByText('0 ticked')).toBeInTheDocument()
  })
})
