/** A project folder opened with Raider, remembered on this computer */
export interface RecentProject {
  /** Absolute path of the project folder */
  path: string
  /** The folder's name when it was opened */
  name: string
  /** When it was last opened, in ms since the epoch */
  lastOpened: number
}

/** A recent project as the landing page and the File menu see it */
export interface RecentProjectEntry extends RecentProject {
  /** The folder is still there */
  exists: boolean
  /** The folder has Raider's config/config.yml */
  isRaider: boolean
}
