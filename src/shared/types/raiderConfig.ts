export interface RaiderConfig {
  name: string
  rubyVersion: string
  createdAt: string
  framework: {
    automation: 'Selenium' | 'Watir' | 'Appium'
    mobile: 'Android' | 'iOS'
  }
  settings: {
    baseUrl: string | null
    browser: 'Chrome' | 'Firefox' | 'Safari' | 'Edge'
    browserSettings: string[]
  }
}
