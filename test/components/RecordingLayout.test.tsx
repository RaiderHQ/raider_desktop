import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import useRecorderStore from '@foundation/Stores/recorderStore'
import RecordingLayout from '@components/TestPage/RecordingLayout'
import { RECORDER_PARTITION } from '@shared/recorderSession'

vi.mock('react-i18next', () => ({
  useTranslation: (): { t: (key: string) => string } => ({ t: (key: string): string => key })
}))

describe('RecordingLayout', () => {
  it('loads the recorded website in its own session, apart from the app', () => {
    const { container } = render(
      <RecordingLayout
        steps={null}
        recording={{
          recordingUrl: 'https://example.com',
          preloadPath: '/app/out/preload/recorderPreload.js',
          cancelReplay: vi.fn()
        }}
        isReplaying={false}
      />
    )
    const webview = container.querySelector('webview')!
    expect(RECORDER_PARTITION).toBe('persist:recorder')
    expect(webview.getAttribute('partition')).toBe(RECORDER_PARTITION)
    expect(webview.getAttribute('preload')).toBe('file:///app/out/preload/recorderPreload.js')
  })

  const layout = (): JSX.Element => (
    <RecordingLayout
      steps={null}
      recording={{ recordingUrl: null, preloadPath: null, cancelReplay: vi.fn() }}
      isReplaying={false}
    />
  )

  describe('guide', () => {
    beforeEach(() => {
      localStorage.clear()
      useRecorderStore.setState({ guideOpen: false })
    })

    it('shows the card on the first recording and not on the second', () => {
      const first = render(layout())
      expect(screen.getByText('guide.step1')).toBeInTheDocument()
      fireEvent.click(screen.getByText('guide.gotIt'))
      expect(screen.queryByText('guide.step1')).not.toBeInTheDocument()
      first.unmount()
      render(layout())
      expect(screen.queryByText('guide.step1')).not.toBeInTheDocument()
    })

    it('Show guide reopens it', () => {
      localStorage.setItem('raider.recordingGuideSeen', '1')
      render(layout())
      expect(screen.queryByText('guide.step1')).not.toBeInTheDocument()
      act(() => useRecorderStore.getState().setGuideOpen(true))
      expect(screen.getByText('guide.step1')).toBeInTheDocument()
    })
  })
})
