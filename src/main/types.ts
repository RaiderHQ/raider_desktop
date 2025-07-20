export interface Test {
  id: string
  name: string
  url: string
  steps: string[]
}

export interface Suite {
  id: string
  name: string
  tests: Test[]
}
