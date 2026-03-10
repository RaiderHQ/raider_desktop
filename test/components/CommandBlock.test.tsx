import { render, screen, fireEvent, act } from '@testing-library/react'
import CommandBlock from '@components/CommandBlock'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, vals?: Record<string, string>) => vals ? `${key} ${JSON.stringify(vals)}` : key })
}))

const mockApi = {
  commandParser: vi.fn().mockResolvedValue('Visited https://example.com'),
  xpathParser: vi.fn().mockResolvedValue('Clicked xpath element')
}

beforeEach(() => {
  window.api = mockApi as any
  vi.clearAllMocks()
})

const baseProps = {
  index: 0,
  showCode: false,
  onDragStart: vi.fn(),
  onDragEnter: vi.fn(),
  onDragEnd: vi.fn(),
  onDelete: vi.fn()
}

describe('CommandBlock', () => {
  it('shows code view when showCode=true', async () => {
    await act(async () => {
      render(<CommandBlock {...baseProps} command='@driver.get("https://example.com")' showCode={true} />)
    })
    expect(screen.getByText('@driver.get("https://example.com")')).toBeInTheDocument()
  })

  it('shows friendly view loading state then result when showCode=false', async () => {
    await act(async () => {
      render(<CommandBlock {...baseProps} command='@driver.get("https://example.com")' showCode={false} />)
    })
    expect(await screen.findByText('Visited https://example.com')).toBeInTheDocument()
    expect(mockApi.commandParser).toHaveBeenCalledWith('@driver.get("https://example.com")')
  })

  it('uses xpathParser for xpath commands', async () => {
    await act(async () => {
      render(<CommandBlock {...baseProps} command="@driver.find_element(:xpath, '//div').click" showCode={false} />)
    })
    expect(mockApi.xpathParser).toHaveBeenCalled()
  })

  it('calls onDelete with the correct index when delete button is clicked', async () => {
    const onDelete = vi.fn()
    await act(async () => {
      render(<CommandBlock {...baseProps} command="step" showCode={true} onDelete={onDelete} index={2} />)
    })
    fireEvent.click(screen.getByLabelText('Delete step'))
    expect(onDelete).toHaveBeenCalledWith(2)
  })

  it('shows a comment in code view when the command contains " # "', async () => {
    await act(async () => {
      render(<CommandBlock {...baseProps} command='@driver.get("url") # navigate' showCode={true} />)
    })
    expect(screen.getByText(/navigate/)).toBeInTheDocument()
  })
})
