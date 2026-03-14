import { render, screen, fireEvent } from '@testing-library/react'
import TestSuitePanel from '@components/TestSuitePanel'
import '@testing-library/jest-dom'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const baseProps = {
  onSuiteChange: vi.fn(),
  onTestSelect: vi.fn(),
  onCreateSuite: vi.fn(),
  onDeleteSuite: vi.fn(),
  onTestDeleteRequest: vi.fn(),
  onRunAllTests: vi.fn(),
  onReorderTests: vi.fn()
}

const mockSuites = [
  {
    id: 'suite-1',
    name: 'Login Suite',
    tests: [
      { id: 'test-1', name: 'Login Test', url: 'http://example.com', steps: ['step 1'] },
      { id: 'test-2', name: 'Logout Test', url: 'http://example.com', steps: [] }
    ]
  },
  {
    id: 'suite-2',
    name: 'Checkout Suite',
    tests: [{ id: 'test-3', name: 'Cart Test', url: '', steps: [] }]
  }
]

beforeEach(() => vi.clearAllMocks())

describe('TestSuitePanel', () => {
  describe('empty state', () => {
    it('shows empty title when no suites', () => {
      render(
        <TestSuitePanel {...baseProps} suites={[]} activeSuiteId={null} activeTestId={null} />
      )
      expect(screen.getByText('recorder.testSuitePanel.emptyTitle')).toBeInTheDocument()
    })

    it('shows create first button', () => {
      render(
        <TestSuitePanel {...baseProps} suites={[]} activeSuiteId={null} activeTestId={null} />
      )
      expect(screen.getByText('recorder.testSuitePanel.createFirst')).toBeInTheDocument()
    })

    it('clicking create first shows name input', () => {
      render(
        <TestSuitePanel {...baseProps} suites={[]} activeSuiteId={null} activeTestId={null} />
      )
      fireEvent.click(screen.getByText('recorder.testSuitePanel.createFirst'))
      expect(
        screen.getByPlaceholderText('recorder.testSuitePanel.newSuiteName')
      ).toBeInTheDocument()
    })

    it('can create a suite from empty state', () => {
      render(
        <TestSuitePanel {...baseProps} suites={[]} activeSuiteId={null} activeTestId={null} />
      )
      fireEvent.click(screen.getByText('recorder.testSuitePanel.createFirst'))

      const input = screen.getByPlaceholderText('recorder.testSuitePanel.newSuiteName')
      fireEvent.change(input, { target: { value: 'New Suite' } })
      fireEvent.click(screen.getByText('recorder.testSuitePanel.create'))

      expect(baseProps.onCreateSuite).toHaveBeenCalledWith('New Suite')
    })

    it('can create suite with Enter key', () => {
      render(
        <TestSuitePanel {...baseProps} suites={[]} activeSuiteId={null} activeTestId={null} />
      )
      fireEvent.click(screen.getByText('recorder.testSuitePanel.createFirst'))

      const input = screen.getByPlaceholderText('recorder.testSuitePanel.newSuiteName')
      fireEvent.change(input, { target: { value: 'Enter Suite' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(baseProps.onCreateSuite).toHaveBeenCalledWith('Enter Suite')
    })

    it('cancel button returns to empty state', () => {
      render(
        <TestSuitePanel {...baseProps} suites={[]} activeSuiteId={null} activeTestId={null} />
      )
      fireEvent.click(screen.getByText('recorder.testSuitePanel.createFirst'))
      fireEvent.click(screen.getByText('recorder.testSuitePanel.cancel'))

      expect(screen.getByText('recorder.testSuitePanel.createFirst')).toBeInTheDocument()
    })

    it('does not call onCreateSuite with empty name', () => {
      render(
        <TestSuitePanel {...baseProps} suites={[]} activeSuiteId={null} activeTestId={null} />
      )
      fireEvent.click(screen.getByText('recorder.testSuitePanel.createFirst'))
      fireEvent.click(screen.getByText('recorder.testSuitePanel.create'))

      expect(baseProps.onCreateSuite).not.toHaveBeenCalled()
    })
  })

  describe('with suites', () => {
    it('renders the active suite name in dropdown', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      expect(screen.getByText('Login Suite')).toBeInTheDocument()
    })

    it('renders test names in the list', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      expect(screen.getByText('Login Test')).toBeInTheDocument()
      expect(screen.getByText('Logout Test')).toBeInTheDocument()
    })

    it('calls onTestSelect when a test is clicked', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      fireEvent.click(screen.getByText('Logout Test'))
      expect(baseProps.onTestSelect).toHaveBeenCalledWith('test-2')
    })

    it('shows suite dropdown when button is clicked', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      fireEvent.click(screen.getByLabelText('recorder.testSuitePanel.selectSuite'))
      expect(screen.getByText('Checkout Suite')).toBeInTheDocument()
    })

    it('calls onSuiteChange when selecting a suite from dropdown', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      fireEvent.click(screen.getByLabelText('recorder.testSuitePanel.selectSuite'))
      fireEvent.click(screen.getByText('Checkout Suite'))
      expect(baseProps.onSuiteChange).toHaveBeenCalledWith('suite-2')
    })

    it('shows new suite option in dropdown', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      fireEvent.click(screen.getByLabelText('recorder.testSuitePanel.selectSuite'))
      expect(screen.getByText('recorder.testSuitePanel.newSuite')).toBeInTheDocument()
    })

    it('shows delete suite option in dropdown', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      fireEvent.click(screen.getByLabelText('recorder.testSuitePanel.selectSuite'))
      expect(screen.getByText('recorder.testSuitePanel.deleteSuite')).toBeInTheDocument()
    })

    it('shows Run All button', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      expect(screen.getByText('recorder.testSuitePanel.runAll')).toBeInTheDocument()
    })

    it('calls onRunAllTests when Run All is clicked', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      fireEvent.click(screen.getByText('recorder.testSuitePanel.runAll'))
      expect(baseProps.onRunAllTests).toHaveBeenCalledWith('suite-1')
    })

    it('calls onTestDeleteRequest when delete button is clicked', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      const deleteBtn = screen.getByLabelText('Delete test Login Test')
      fireEvent.click(deleteBtn)
      expect(baseProps.onTestDeleteRequest).toHaveBeenCalledWith(mockSuites[0].tests[0])
    })

    it('active test has font-semibold class', () => {
      render(
        <TestSuitePanel
          {...baseProps}
          suites={mockSuites}
          activeSuiteId="suite-1"
          activeTestId="test-1"
        />
      )
      const activeTest = screen.getByText('Login Test')
      expect(activeTest.className).toContain('font-semibold')
    })

    it('Run All is disabled when suite has no tests', () => {
      const emptyTestSuite = [{ id: 's1', name: 'Empty', tests: [] }]
      render(
        <TestSuitePanel
          {...baseProps}
          suites={emptyTestSuite}
          activeSuiteId="s1"
          activeTestId={null}
        />
      )
      expect(screen.getByText('recorder.testSuitePanel.runAll').closest('button')).toBeDisabled()
    })
  })
})
