/** A login saved by ruby_raider in `.raider/auth`; only harmless fields, never cookies or storage */
export interface SavedLogin {
  /** The file name without `.json` */
  name: string
  origin: string | null
  savedAt: string | null
  format: number | null
  /** False for a format this app does not understand, or a file it could not read */
  known: boolean
  expired: boolean
  expiredReason?: 'age' | 'site'
}

/** 'gem': ruby_raider is older than 3.11; 'helper': the project lacks helpers/session_state.rb */
export type LoginsUnsupportedReason = 'gem' | 'helper'

export interface SavedLoginsResult {
  logins: SavedLogin[]
  /** Why the project cannot save logins; null when it can, or when it is not known to be unable */
  unsupportedReason: LoginsUnsupportedReason | null
}
