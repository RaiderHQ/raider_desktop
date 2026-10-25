import type { Test } from '@foundation/Types/test'

export const createNewTest = (): Test => ({
  id: crypto.randomUUID(),
  name: 'Untitled Test',
  url: 'https://raider-test-site.onrender.com/',
  steps: []
})
