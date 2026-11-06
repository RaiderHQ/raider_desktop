import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import RecordingGuide, { openRecordingGuide } from '@components/RecordingGuide'
import { hasSeenGuide } from '@foundation/recordingGuideSeen'
import useRecorderStore from '@foundation/Stores/recorderStore'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

beforeEach(() => {
  localStorage.clear()
  useRecorderStore.setState({ guideOpen: true })
})
afterEach(() => vi.restoreAllMocks())

describe('RecordingGuide', () => {
  it('renders the three steps, Got it and the docs link', () => {
    render(<RecordingGuide variant="card" />)
    for (const key of ['title', 'step1', 'step2', 'gotIt'])
      expect(screen.getByText(`guide.${key}`)).toBeInTheDocument()
    // Each chip follows the name of its control
    const li = document.querySelectorAll('li')[2]
    expect(li.textContent).toMatch(/^guide\.step3Before.+guide\.step3Middle.+guide\.step3After$/)
    expect(li.querySelectorAll('kbd')).toHaveLength(2)
    expect(li.querySelector('kbd')!.previousSibling!.textContent).toBe('guide.step3Before')
    // No docs button until the docs link exists
    expect(screen.queryByText('guide.learnMore')).not.toBeInTheDocument()
  })

  it('the card is a labelled region', () => {
    render(<RecordingGuide variant="card" />)
    const region = screen.getByRole('region')
    expect(region).toHaveAttribute('aria-labelledby', screen.getByText('guide.title').id)
  })

  it('the modal is a labelled dialog, focuses Got it and closes on Esc', () => {
    const onClose = vi.fn()
    render(<RecordingGuide variant="modal" onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', screen.getByText('guide.title').id)
    expect(screen.getByText('guide.gotIt')).toHaveFocus()
    fireEvent.keyDown(screen.getByText('guide.gotIt'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  describe('openRecordingGuide', () => {
    it('reopens the card while a recording is showing', () => {
      useRecorderStore.setState({ guideOpen: false, recordingUrl: 'https://example.com' })
      const showModal = vi.fn()
      openRecordingGuide(showModal)
      expect(useRecorderStore.getState().guideOpen).toBe(true)
      expect(showModal).not.toHaveBeenCalled()
    })

    it('opens the modal otherwise', () => {
      useRecorderStore.setState({ guideOpen: false, recordingUrl: null })
      const showModal = vi.fn()
      openRecordingGuide(showModal)
      expect(showModal).toHaveBeenCalled()
      expect(useRecorderStore.getState().guideOpen).toBe(false)
    })
  })

  it('Got it marks the guide seen and closes', () => {
    const onClose = vi.fn()
    render(<RecordingGuide variant="card" onClose={onClose} />)
    fireEvent.click(screen.getByText('guide.gotIt'))
    expect(hasSeenGuide()).toBe(true)
    expect(useRecorderStore.getState().guideOpen).toBe(false)
    expect(onClose).toHaveBeenCalled()
  })

  it('still closes when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const onClose = vi.fn()
    render(<RecordingGuide variant="modal" onClose={onClose} />)
    fireEvent.click(screen.getByText('guide.gotIt'))
    expect(onClose).toHaveBeenCalled()
  })
})
