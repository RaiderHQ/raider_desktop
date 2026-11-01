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

export interface SavedLoginsResult {
  logins: SavedLogin[]
  gemSupportsLogins: boolean
}
