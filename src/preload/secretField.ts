// A field is secret when it is a password input, or when its autocomplete hint
// names a password (e.g. a "show password" toggle that switched it to text).
export function isSecretField(el: Element): boolean {
  if (el.tagName !== 'INPUT') return false
  const input = el as HTMLInputElement
  return input.type.toLowerCase() === 'password' || /password/i.test(input.autocomplete)
}

/** What the recorder sends for a changed field: its value, or only a flag for a secret. */
export function fieldValue(
  el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
): { value: string } | { secret: true } {
  return isSecretField(el) ? { secret: true } : { value: el.value }
}
