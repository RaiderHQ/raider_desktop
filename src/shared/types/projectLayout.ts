export interface ProjectLayout {
  framework: 'rspec' | 'cucumber'
  automation: 'selenium' | 'watir'
  /** Config `spec_path`, default 'spec' */
  specPath: string
  /** Config `feature_path`, default 'features' */
  featurePath: string
  /** Config `helper_path`, default 'helpers' */
  helperPath: string
  /** False for appium / minitest / capybara / no Gemfile */
  recordable: boolean
  unsupportedReason?: 'mobile' | 'minitest' | 'capybara' | 'noGemfile'
}
