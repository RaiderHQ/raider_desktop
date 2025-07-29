import { render, screen } from '@testing-library/react'
import TestSuitePanel from '@components/TestSuitePanel'
import '@testing-library/jest-dom'

const mockSuites = [
  {
    id: 'suite-1',
    name: 'My Suite',
    tests: [
      {
        id: 'test-1',
        name: 'My Test',
        url: 'http://example.com',
        steps: ['step 1', 'step 2']
      }
    ]
  }
]

describe('TestSuitePanel', () => {
  it('renders the suite and test names', () => {
    render(
      <TestSuitePanel
        suites={mockSuites}
        activeSuiteId="suite-1"
        activeTestId="test-1"
        onSuiteChange={() => {}}
        onTestSelect={() => {}}
        onCreateSuite={() => {}}
        onDeleteSuite={() => {}}
        onTestDeleteRequest={() => {}}
        onRunAllTests={() => {}}
        onReorderTests={() => {}}
      />
    )

    expect(screen.getByText('My Suite')).toBeInTheDocument()
    expect(screen.getByText('My Test')).toBeInTheDocument()
  })
})
