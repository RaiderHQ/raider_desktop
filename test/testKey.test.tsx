import { createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createHashRouter, useParams } from 'react-router'
import { describe, it, expect } from 'vitest'
import { fromRouteParam, parseTestKey, testKeyOf, toRouteParam } from '@foundation/testKey'

describe('testKey', () => {
  it('prefers the test id, falls back to the file', () => {
    expect(testKeyOf({ name: 'a', testId: 't1', file: 'spec/a_spec.rb' } as never)).toBe('id:t1')
    expect(testKeyOf({ name: 'a', file: 'spec/a_spec.rb' } as never)).toBe('file:spec/a_spec.rb')
  })

  it('parses keys', () => {
    expect(parseTestKey('id:t1')).toEqual({ kind: 'id', testId: 't1' })
    expect(parseTestKey('file:spec/a_spec.rb')).toEqual({ kind: 'file', file: 'spec/a_spec.rb' })
    expect(parseTestKey('junk')).toBeNull()
    expect(parseTestKey('id:')).toBeNull()
  })

  it.each(['id:t1', 'file:spec/a b_spec.rb', 'file:spec/nested/ü_spec.rb'])(
    'round-trips %s through a URL-safe param',
    (key) => {
      const param = toRouteParam(key)
      expect(param).toMatch(/^[A-Za-z0-9_-]+$/)
      expect(fromRouteParam(param)).toBe(key)
    }
  )

  it('a hash route yields the key from useParams', () => {
    const key = 'file:spec/x/y_spec.rb'
    window.history.replaceState(null, '', `#/overview/tests/${toRouteParam(key)}`)
    const Probe = (): JSX.Element => {
      const { testKey } = useParams()
      return createElement('div', { 'data-testid': 'key' }, fromRouteParam(testKey ?? ''))
    }
    const router = createHashRouter([{ path: '/overview/tests/:testKey', element: <Probe /> }])
    render(<RouterProvider router={router} />)
    expect(screen.getByTestId('key')).toHaveTextContent(key)
  })

  it('fromRouteParam tolerates garbage', () => {
    expect(fromRouteParam('%%%')).toBe('')
  })
})
