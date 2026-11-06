export type Platform = 'mac' | 'other'

/** 'mac' when the platform string (e.g. navigator.platform) starts with "Mac" */
export function platformFrom(platform: string | undefined): Platform {
  return /^mac/i.test(platform ?? '') ? 'mac' : 'other'
}
