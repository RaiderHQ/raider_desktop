/** Ids and classes a framework minted at runtime, which change between builds or loads. */
export function looksGenerated(id: string): boolean {
  return (
    /\d{4,}/.test(id) ||
    /[0-9a-f]{8,}/i.test(id) ||
    id.startsWith(':') ||
    /^(ember|ext-gen|react-|mui-|radix-)/.test(id)
  )
}
