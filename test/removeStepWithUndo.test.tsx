import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import toast, { Toaster } from 'react-hot-toast'
import '@testing-library/jest-dom'
import '@foundation/Translation/Backend'
import { removeStepWithUndo } from '@foundation/removeStepWithUndo'
import type { Test } from '@foundation/Types/test'
import type { Step } from '@shared/types/step'

// react-hot-toast's Toaster asks for prefers-reduced-motion, which jsdom lacks
beforeAll(() => {
  window.matchMedia = (): MediaQueryList =>
    ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }) as never
})
beforeEach(() => toast.remove())

const steps: Step[] = [
  { id: 'a', kind: 'navigate', url: 'https://x.test' } as Step,
  { id: 'b', kind: 'navigate', url: 'https://x.test/b' } as Step,
  { id: 'c', kind: 'navigate', url: 'https://x.test/c' } as Step
]

/** A stand-in for the recorder store's updateActiveTest */
type Store = { test: Test | null; update: (u: (p: Test | null) => Test | null) => void }
const store = (): Store => {
  const s: Store = {
    test: { id: 't', name: 'T', url: 'https://x.test', steps } as unknown as Test,
    update: (u: (p: Test | null) => Test | null): void => {
      s.test = u(s.test)
    }
  }
  return s
}

describe('removeStepWithUndo', () => {
  it('removes the step and offers Undo in a toast', async () => {
    render(<Toaster />)
    const s = store()
    await act(async () => {
      removeStepWithUndo(s.update, 1)
    })
    expect(s.test?.steps.map((x) => x.id)).toEqual(['a', 'c'])
    expect(screen.getByText('Step removed')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })
    expect(s.test?.steps.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    // The toast is dismissed; react-hot-toast takes it out after its exit animation
    await waitFor(() => expect(screen.queryByText('Step removed')).not.toBeInTheDocument(), {
      timeout: 3000
    })
  })

  it('puts the step back where it was even after later edits', async () => {
    render(<Toaster />)
    const s = store()
    await act(async () => {
      removeStepWithUndo(s.update, 0)
    })
    s.update((p) => (p ? { ...p, steps: [...p.steps, { id: 'd', kind: 'navigate' } as Step] } : p))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })
    expect(s.test?.steps.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does nothing without a test', () => {
    const s = store()
    s.test = null
    removeStepWithUndo(s.update, 0)
    expect(s.test).toBeNull()
  })

  it('leaves another test alone when Undo is clicked after switching', async () => {
    render(<Toaster />)
    const s = store()
    await act(async () => {
      removeStepWithUndo(s.update, 1)
    })
    const other = { id: 'other', name: 'O', url: 'https://o.test', steps: [] } as unknown as Test
    s.test = other
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    })
    expect(s.test.steps).toEqual([])
  })

  it('inserts once even when Undo is clicked twice', async () => {
    render(<Toaster />)
    const s = store()
    await act(async () => {
      removeStepWithUndo(s.update, 1)
    })
    const undo = screen.getByRole('button', { name: 'Undo' })
    await act(async () => {
      fireEvent.click(undo)
      fireEvent.click(undo)
    })
    expect(s.test?.steps.map((x) => x.id)).toEqual(['a', 'b', 'c'])
  })

  it.each([
    ['newest first', [0, 1]],
    ['oldest first', [1, 0]]
  ])('puts two quick removals back in order, undone %s', async (_order, clicks) => {
    render(<Toaster />)
    const s = store()
    s.test = { ...(s.test as Test), steps: [...steps, { id: 'd', kind: 'navigate' } as Step] }
    await act(async () => {
      removeStepWithUndo(s.update, 1) // b
      removeStepWithUndo(s.update, 1) // c
    })
    expect(s.test?.steps.map((x) => x.id)).toEqual(['a', 'd'])
    const undos = screen.getAllByRole('button', { name: 'Undo' })
    expect(undos).toHaveLength(2)
    for (const i of clicks) {
      await act(async () => {
        fireEvent.click(undos[i])
      })
    }
    expect(s.test?.steps.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
