import { render } from '@testing-library/react'
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
})
