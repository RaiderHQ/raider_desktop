export const toMediaUrl = (absPath: string): string =>
  `raider-media://file/${encodeURIComponent(absPath)}`
