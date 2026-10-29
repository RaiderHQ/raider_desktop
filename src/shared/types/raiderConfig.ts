export interface RaiderConfig {
  name: string
  rubyVersion: string
  createdAt: string
  framework: {
    automation: 'Selenium' | 'Watir' | 'Appium'
    test: 'Rspec' | 'Cucumber'
    mobile: 'Android' | 'iOS'
  }
  settings: {
    baseUrl: string | null
    browser: 'Chrome' | 'Firefox' | 'Safari' | 'Edge'
    browserSettings: string[]
  }
}
