import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import ScreenshotComparison from '@components/ScreenshotComparison'
import type { ScreenshotComparison as Comparison } from '@foundation/Types/testResult'

vi.mock('react-i18next', async () => {
  const strings = (await import('@assets/translations/en.json')).default
  const lookup = (key: string): unknown =>
    key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], strings)
  const t = (key: string, values: Record<string, unknown> = {}): string => {
    const text = lookup(key)
    if (typeof text !== 'string') return key
    return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''))
  }
  return { useTranslation: (): { t: typeof t } => ({ t }) }
})

const failed: Comparison = {
  name: 'home',
  status: 'failed',
  baseline: 'screenshots/baselines/chrome/home.png',
  diffPixels: 1797705,
  diffRatio: 0.99927,
  threshold: 0.1,
  maxDiffPixels: 0,
  maxDiffRatio: null,
  expectedSize: [1280, 720],
  actualSize: [1280, 720],
  images: { expected: '/r/e.png', actual: '/r/a.png', diff: '/r/d.png' }
}

const created: Comparison = {
  ...failed,
  name: 'fresh',
  status: 'created',
  diffPixels: null,
  diffRatio: null,
  expectedSize: null,
  images: { actual: '/r/fresh-a.png' }
}

const passed = (name: string): Comparison => ({
  ...failed,
  name,
  status: 'passed',
  diffPixels: 0,
  diffRatio: 0,
  images: {}
})

const readImage = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  readImage.mockImplementation(async (path: string) => ({
    success: true,
    data: 'AAAA',
    fileExt: path.slice(path.lastIndexOf('.'))
  }))
  window.api = { readImage } as unknown as typeof window.api
})

describe('ScreenshotComparison', () => {
  it('shows the section title, name, status and numbers of a failed comparison', () => {
    render(<ScreenshotComparison comparisons={[failed]} />)
    expect(screen.getByText('Screenshot comparison')).toBeInTheDocument()
    expect(screen.getByText('home')).toBeInTheDocument()
    expect(screen.getByText('Did not match')).toBeInTheDocument()
    expect(screen.getByText('1,797,705 pixels (99.93%) differ')).toBeInTheDocument()
    expect(screen.getByText(/allowed: 0 pixels/)).toBeInTheDocument()
    expect(screen.getByText(/threshold 0.1/)).toBeInTheDocument()
  })

  it('shows the allowed ratio as a percent when there is one', () => {
    render(
      <ScreenshotComparison
        comparisons={[{ ...failed, maxDiffPixels: null, maxDiffRatio: 0.015 }]}
      />
    )
    expect(screen.getByText(/allowed: 1.50%/)).toBeInTheDocument()
  })

  it('has three accessible tabs, Diff selected, and reads only the Diff image on mount', async () => {
    render(<ScreenshotComparison comparisons={[failed]} />)
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Expected', 'Actual', 'Diff'])
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Diff' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Expected' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tabpanel')).toBeInTheDocument()
    const img = await screen.findByAltText('Diff screenshot for home')
    expect(img.getAttribute('src')).toBe('data:image/png;base64,AAAA')
    expect(readImage).toHaveBeenCalledTimes(1)
    expect(readImage).toHaveBeenCalledWith('/r/d.png')
  })

  it('reads the expected image when its tab is clicked', async () => {
    render(<ScreenshotComparison comparisons={[failed]} />)
    await screen.findByAltText('Diff screenshot for home')
    fireEvent.click(screen.getByRole('tab', { name: 'Expected' }))
    expect(screen.getByRole('tab', { name: 'Expected' })).toHaveAttribute('aria-selected', 'true')
    expect(await screen.findByAltText('Expected screenshot for home')).toBeInTheDocument()
    expect(readImage).toHaveBeenLastCalledWith('/r/e.png')
    expect(readImage).toHaveBeenCalledTimes(2)
  })

  it('shows only the Actual tab for a created comparison, with no numbers', async () => {
    render(<ScreenshotComparison comparisons={[created]} />)
    expect(await screen.findByAltText('Actual screenshot for fresh')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Actual'])
    expect(screen.getByText('New baseline')).toBeInTheDocument()
    expect(screen.queryByText(/pixels|allowed/)).not.toBeInTheDocument()
  })

  it('shows both sizes when they differ, and still shows the numbers', () => {
    render(
      <ScreenshotComparison
        comparisons={[{ ...failed, expectedSize: [1280, 720], actualSize: [1280, 800] }]}
      />
    )
    expect(screen.getByText('Size changed: 1280×720 → 1280×800')).toBeInTheDocument()
    expect(screen.getByText('1,797,705 pixels (99.93%) differ')).toBeInTheDocument()
  })

  it('does not mention size when the sizes are equal', () => {
    render(<ScreenshotComparison comparisons={[failed]} />)
    expect(screen.queryByText(/Size changed/)).not.toBeInTheDocument()
  })

  it('collapses passed comparisons into one line with no tabs', () => {
    render(<ScreenshotComparison comparisons={[passed('a'), passed('b'), passed('c')]} />)
    expect(screen.getByText('3 matched')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByText('a')).not.toBeInTheDocument()
    expect(readImage).not.toHaveBeenCalled()
  })

  it('lists failed entries and the matched line together', () => {
    render(<ScreenshotComparison comparisons={[passed('a'), failed]} />)
    expect(screen.getByText('1 matched')).toBeInTheDocument()
    expect(screen.getByText('home')).toBeInTheDocument()
  })

  it('shows "Image not available" inline when the read fails, without a toast', async () => {
    readImage.mockResolvedValue({ success: false, error: 'nope' })
    render(<ScreenshotComparison comparisons={[failed]} />)
    expect(await screen.findByText('Image not available')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows "Image not available" when the read rejects', async () => {
    readImage.mockRejectedValue(new Error('boom'))
    render(<ScreenshotComparison comparisons={[failed]} />)
    expect(await screen.findByText('Image not available')).toBeInTheDocument()
  })

  it('ignores a slow read for a tab that is no longer shown', async () => {
    let resolveDiff: (v: unknown) => void = () => {}
    readImage.mockImplementation((path: string) =>
      path === '/r/d.png'
        ? new Promise((r) => (resolveDiff = r))
        : Promise.resolve({ success: true, data: 'EEEE', fileExt: '.png' })
    )
    render(<ScreenshotComparison comparisons={[failed]} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Expected' }))
    const panel = screen.getByRole('tabpanel')
    expect(await within(panel).findByAltText('Expected screenshot for home')).toBeInTheDocument()
    resolveDiff({ success: true, data: 'DDDD', fileExt: '.png' })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByAltText('Diff screenshot for home')).not.toBeInTheDocument()
    const src = screen.getByAltText('Expected screenshot for home').getAttribute('src')
    expect(src).toContain('EEEE')
  })

  it('does not set state after unmount', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    let resolve: (v: unknown) => void = () => {}
    readImage.mockImplementation(() => new Promise((r) => (resolve = r)))
    const { unmount } = render(<ScreenshotComparison comparisons={[failed]} />)
    unmount()
    resolve({ success: true, data: 'AAAA', fileExt: '.png' })
    await waitFor(() => expect(errors).not.toHaveBeenCalled())
    errors.mockRestore()
  })
})
