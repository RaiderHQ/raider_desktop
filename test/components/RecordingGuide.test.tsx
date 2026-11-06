import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import RecordingGuide from '@components/RecordingGuide'
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
    for (const key of ['title', 'step1', 'step2', 'step3', 'gotIt', 'learnMore'])
      expect(screen.getByText(`guide.${key}`)).toBeInTheDocument()
    expect(document.querySelectorAll('kbd')).toHaveLength(2)
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
