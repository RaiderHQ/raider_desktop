import { setProjectBaseUrl } from './appState'

function loadUrlRequest(url: string): { success: boolean } {
  setProjectBaseUrl(url)
  console.log(`[MainProcess] Project base URL set to: ${url}`)
  return { success: true }
}

export default loadUrlRequest
