export interface RaiderConfig {
  name: string
  rubyVersion: string
  createdAt: string
  framework: {
    automation: 'Appium' | 'Selenium' | 'Axe'
    test: 'Rspec' | 'Cucumber'
    mobile: 'Android' | 'iOS'
  }
  settings: {
    baseUrl: string | null
    browser: 'Chrome' | 'Firefox' | 'Safari' | 'Edge'
    browserSettings: string[]
  }
}
