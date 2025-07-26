import { setProjectBaseUrl } from './appState'

const handler = (url: string): void => {
  setProjectBaseUrl(url)
}

export default handler
