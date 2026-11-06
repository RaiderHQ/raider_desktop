import '@testing-library/jest-dom'

// Tooltips show on keyboard focus only; tests that fire a bare focus event stand for a Tab
beforeEach(() => {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
})
