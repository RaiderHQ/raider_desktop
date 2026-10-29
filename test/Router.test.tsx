import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { vi, describe, it, expect } from 'vitest'
import { MemoryRouter, useRoutes } from 'react-router'
import { routes } from '../src/renderer/src/Router'

vi.mock('@templates/Main', async () => {
  const { Outlet } = await import('react-router')
  return { default: (): JSX.Element => <Outlet /> }
})
vi.mock('@pages/Overview', async () => {
  const { Outlet, useLocation } = await import('react-router')
  return {
    default: (): JSX.Element => (
      <div data-testid="overview">
        {useLocation().pathname}
        <Outlet />
      </div>
    )
  }
})
vi.mock('@pages/FileEditor', () => ({ default: (): JSX.Element => <div /> }))
vi.mock('@pages/New', () => ({ default: (): JSX.Element => <div /> }))
vi.mock('@pages/Landing', () => ({ default: (): JSX.Element => <div /> }))

// A data router's navigations need a real AbortSignal, which jsdom doesn't provide; useRoutes
// exercises the same route table without one.
const Routed = (): JSX.Element | null => useRoutes(routes)

describe('routes', () => {
  it('redirects the old /recorder route to the Tests tab', async () => {
    render(
      <MemoryRouter initialEntries={['/recorder']}>
        <Routed />
      </MemoryRouter>
    )
    expect(await screen.findByTestId('overview')).toHaveTextContent('/overview/tests')
  })
})
