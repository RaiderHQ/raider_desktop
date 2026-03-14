import { describe, it, expect, beforeEach } from 'vitest'
import useLoadingStore from '@foundation/Stores/loadingStore'

describe('loadingStore', () => {
  beforeEach(() => {
    useLoadingStore.setState({ loading: false })
  })

  it('initializes with loading false', () => {
    expect(useLoadingStore.getState().loading).toBe(false)
  })

  it('sets loading to true', () => {
    useLoadingStore.getState().setLoading(true)
    expect(useLoadingStore.getState().loading).toBe(true)
  })

  it('sets loading back to false', () => {
    useLoadingStore.getState().setLoading(true)
    useLoadingStore.getState().setLoading(false)
    expect(useLoadingStore.getState().loading).toBe(false)
  })
})
