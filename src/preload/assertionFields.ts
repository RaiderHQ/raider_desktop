import { isSecretField } from './secretField'

/** What the assertion menu needs about the element and page; a secret field's value is never read */
export const assertionFields = (
  target: Element
): { elementValue: string; inputType: string; pageTitle: string; pageUrl: string } => ({
  elementValue: isSecretField(target) ? '' : ((target as HTMLInputElement).value ?? ''),
  inputType: target.tagName === 'INPUT' ? (target as HTMLInputElement).type.toLowerCase() : '',
  pageTitle: document.title,
  pageUrl: window.location.href
})
