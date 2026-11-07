import { isSecretField } from './secretField'

/** What the assertion menu needs about the element and page; a secret field's value is never read */
export const assertionFields = (
  target: Element
): {
  elementText: string
  elementValue: string
  inputType: string
  pageTitle: string
  pageUrl: string
} => ({
  // Full text (region or not) for an exact-text check; apart from the short label hint
  elementText: ((target as HTMLElement).innerText || '').slice(0, 2000),
  elementValue: isSecretField(target) ? '' : ((target as HTMLInputElement).value ?? ''),
  inputType: target.tagName === 'INPUT' ? (target as HTMLInputElement).type.toLowerCase() : '',
  pageTitle: document.title,
  pageUrl: window.location.href
})
