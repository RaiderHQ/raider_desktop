import { render } from '@testing-library/react'
import LoadingScreen from '@components/LoadingScreen'
import useLoadingStore from '@foundation/Stores/loadingStore'
import '@testing-library/jest-dom'

describe('LoadingScreen', () => {
  it('renders nothing when loading=false and shouldPersist=true (default)', () => {
    useLoadingStore.setState({ loading: false })
    const { container } = render(<LoadingScreen />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the spinner when loading=true', () => {
    useLoadingStore.setState({ loading: true })
    render(<LoadingScreen />)
    // The spinner has the animate-spin class
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders when shouldPersist=false regardless of loading state', () => {
    useLoadingStore.setState({ loading: false })
    render(<LoadingScreen shouldPersist={false} />)
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })
})
