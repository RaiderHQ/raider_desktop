import { app } from 'electron'

export const closeApp = (): void => {
  app.quit()
}
