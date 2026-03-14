export interface RaiderConfig {
  name: string
  rubyVersion: string
  createdAt: string
  framework: {
    automation: 'Appium' | 'Selenium' | 'Axe' | 'Capybara' | 'Watir' | 'Applitools'
    test: 'Rspec' | 'Cucumber' | 'Minitest'
    mobile: 'Android' | 'iOS'
  }
  settings: {
    baseUrl: string | null
    browser: 'Chrome' | 'Firefox' | 'Safari' | 'Edge'
    browserSettings: string[]
  }
}
