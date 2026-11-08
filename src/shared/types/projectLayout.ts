export type MobilePlatform = 'ios' | 'android' | 'cross_platform'

export interface ProjectLayout {
  framework: 'rspec'
  automation: 'selenium' | 'appium'
  /** Set for appium projects whose capabilities.yml could be read */
  mobilePlatform?: MobilePlatform
  /** Config `spec_path`, default 'spec' */
  specPath: string
  /** Config `feature_path`, default 'features' */
  featurePath: string
  /** Config `helper_path`, default 'helpers' */
  helperPath: string
  /** The ruby_raider the project locks (Gemfile.lock) or pins (Gemfile); absent when unknown */
  rubyRaiderVersion?: string
  /** False for appium / minitest / capybara / no Gemfile / a ruby_raider below 4.0 */
  recordable: boolean
  unsupportedReason?: 'mobile' | 'minitest' | 'capybara' | 'noGemfile' | 'gemTooOld'
}
