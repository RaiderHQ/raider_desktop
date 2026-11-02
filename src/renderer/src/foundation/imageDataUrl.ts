/** A data URL for a picture `readImage` returned, typed from its file extension. */
export const imageDataUrl = (res: { data?: string; fileExt?: string }): string | null => {
  if (!res.data) return null
  const ext = (res.fileExt ?? '').toLowerCase()
  const type = ext === '.jpg' || ext === '.jpeg' ? 'jpeg' : 'png'
  return `data:image/${type};base64,${res.data}`
}
