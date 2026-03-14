import { Test } from './test'

export interface Suite {
  id: string
  name: string
  tests: Test[]
}
