import type { ProjectLayout } from './projectLayout'

/** What `upgrade-ruby-raider` answers: the project's layout after a successful update. */
export interface UpgradeResult {
  success: boolean
  layout?: ProjectLayout
  error?: string
  output?: string
}
