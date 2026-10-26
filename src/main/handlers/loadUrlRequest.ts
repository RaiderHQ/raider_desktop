import { appState } from './appState'

/** Sets the URL the next recording starts at; an empty URL falls back to the project base URL. */
const handler = (url: string): void => {
  appState.sessionUrl = url || null
}

export default handler
