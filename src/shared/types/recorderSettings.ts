export interface RecorderSettings {
  baseUrl: string
  browser: string
  headless: boolean
  implicitWait: number
  explicitWait: number
  selectorPriority: string[]
  /** config.yml test_id_attribute: the attribute a test-id locator reads */
  testIdAttribute: string
}
