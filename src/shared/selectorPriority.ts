/** The recorder's default locator order: the first kind an element has is the one recorded. */
export const DEFAULT_SELECTOR_PRIORITY: readonly string[] = [
  'role',
  'label',
  'testId',
  'text',
  'id',
  'css',
  'xpath'
]
