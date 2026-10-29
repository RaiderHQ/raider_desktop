import { Test } from './test'

export interface Suite {
  id: string
  name: string
  tests: Test[]
}

/**
 * Id of the suite Raider fills with recorded tests no other suite lists. It is
 * identified by this id, never by its name, and cannot be deleted.
 */
export const UNLISTED_SUITE_ID = 'not-in-a-suite'
