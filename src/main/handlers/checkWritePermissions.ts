import fs from 'fs'

const handler = async (filePath: string): Promise<boolean> => {
  return new Promise((resolve) => {
    fs.access(filePath, fs.constants.W_OK, (err) => {
      if (err) {
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}

export default handler
