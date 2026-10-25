import type { Test } from '@foundation/Types/test'

export const createNewTest = (): Test => ({
  id: crypto.randomUUID(),
  name: 'Untitled Test',
  // Empty: recording starts at the project's base URL
  url: '',
  steps: []
})
