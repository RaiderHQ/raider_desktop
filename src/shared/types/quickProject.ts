/** A Quick record project kept in Raider's own folder */
export interface QuickProject {
  /** Absolute path of the project folder */
  path: string
  /** The folder name */
  name: string
  /** When it last changed, in ms since the epoch */
  modifiedAt: number
}
