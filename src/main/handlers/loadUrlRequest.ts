import { appState } from './appState'

const handler = (url: string): void => {
  appState.sessionUrl = url
}

export default handler
